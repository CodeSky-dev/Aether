// @aether/editor-host · Drift 持久化。
// 基于 IndexedDB 的本地持久化：Y.Doc 增量 update 追加写入，达到阈值后压实为
// 全量快照。恢复时将快照与追加 update 依次应用到新建 Y.Doc，保证断网期间
// 的编辑在重连前不丢失（对应 docs/roadmap/milestones.md M1 Drift Persistence）。
import { applyDocUpdate, encodeDocUpdate } from '@aether/current-sync'
import type * as Y from 'yjs'

const DEFAULT_DB_NAME = 'aether-drift'
const DEFAULT_STORE_NAME = 'documents'
const DEFAULT_COMPACTION_THRESHOLD = 100

/** 单个 doc_ref 的本地持久化记录：快照 + 快照之后追加的增量 update。 */
export interface DriftDocRecord {
  docRef: string
  /** 全量快照；为 null 表示尚无压实记录。 */
  snapshot: Uint8Array | null
  /** 追加的增量 update，按写入顺序排列。 */
  updates: Uint8Array[]
  createdAt: number
  updatedAt: number
}

export interface DriftLoadResult {
  snapshot: Uint8Array | null
  updates: Uint8Array[]
}

/** Drift 存储抽象：IndexedDB 实现用于生产，测试可注入内存实现。 */
export interface DriftStore {
  open(): Promise<void>
  load(docRef: string): Promise<DriftLoadResult | null>
  /** 追加一条增量 update，返回追加后的 update 条数。 */
  append(docRef: string, update: Uint8Array): Promise<number>
  /** 压实：用全量快照替换已有记录并清空增量。 */
  compact(docRef: string, snapshot: Uint8Array): Promise<void>
  clear(docRef: string): Promise<void>
  /** 等待已入队的全部写入完成。 */
  flush(): Promise<void>
  close(): Promise<void>
}

export interface IndexedDbDriftStoreOptions {
  dbName?: string
  storeName?: string
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

function openDatabase(
  dbName: string,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)
    request.onupgradeneeded = () => upgrade(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open database ${dbName}`))
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * IndexedDB 版 DriftStore。
 * 单条记录按 doc_ref 键存储，Uint8Array 经结构化克隆原样保存；
 * 写事务串行排队，避免并发读写同一记录导致更新丢失。
 */
export class IndexedDbDriftStore implements DriftStore {
  private readonly dbName: string
  private readonly storeName: string
  private db: IDBDatabase | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  public constructor(options: IndexedDbDriftStoreOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME
  }

  public async open(): Promise<void> {
    if (this.db) {
      return
    }
    this.db = await openDatabase(this.dbName, (db) => {
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName, { keyPath: 'docRef' })
      }
    })
  }

  public async load(docRef: string): Promise<DriftLoadResult | null> {
    await this.open()
    const record = await this.readRecord(docRef)
    if (!record) {
      return null
    }
    return {
      snapshot: record.snapshot,
      updates: record.updates,
    }
  }

  public append(docRef: string, update: Uint8Array): Promise<number> {
    return this.enqueueWrite(async (store) => {
      const record = await this.readRecordFromStore(store, docRef)
      const now = Date.now()
      const next: DriftDocRecord = {
        docRef,
        snapshot: record?.snapshot ?? null,
        updates: [...(record?.updates ?? []), update],
        createdAt: record?.createdAt ?? now,
        updatedAt: now,
      }
      await toPromise(store.put(next))
      return next.updates.length
    })
  }

  public compact(docRef: string, snapshot: Uint8Array): Promise<void> {
    return this.enqueueWrite(async (store) => {
      const record = await this.readRecordFromStore(store, docRef)
      const now = Date.now()
      const next: DriftDocRecord = {
        docRef,
        snapshot,
        updates: [],
        createdAt: record?.createdAt ?? now,
        updatedAt: now,
      }
      await toPromise(store.put(next))
    })
  }

  public clear(docRef: string): Promise<void> {
    return this.enqueueWrite(async (store) => {
      await toPromise(store.delete(docRef))
    })
  }

  public async close(): Promise<void> {
    await this.writeQueue
    this.db?.close()
    this.db = null
  }

  /** 等待已入队的全部写入完成。 */
  public async flush(): Promise<void> {
    await this.writeQueue
  }

  private readRecord(docRef: string): Promise<DriftDocRecord | undefined> {
    const db = this.requireDb()
    const transaction = db.transaction(this.storeName, 'readonly')
    return toPromise(
      transaction.objectStore(this.storeName).get(docRef) as IDBRequest<
        DriftDocRecord | undefined
      >,
    )
  }

  private readRecordFromStore(
    store: IDBObjectStore,
    docRef: string,
  ): Promise<DriftDocRecord | undefined> {
    return toPromise(
      store.get(docRef) as IDBRequest<DriftDocRecord | undefined>,
    )
  }

  private enqueueWrite<T>(
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const run = this.writeQueue.then(() => this.runTransaction(operation))
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async runTransaction<T>(
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    await this.open()
    const db = this.requireDb()
    const transaction = db.transaction(this.storeName, 'readwrite')
    const result = await operation(transaction.objectStore(this.storeName))
    await transactionDone(transaction)
    return result
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDbDriftStore is not open')
    }
    return this.db
  }
}

export type DriftStatus = 'idle' | 'restoring' | 'ready' | 'error'

export type DriftStatusListener = (status: DriftStatus) => void

export interface DriftPersistenceOptions {
  /** Y.Doc 引用标识，作为 IndexedDB 记录键。 */
  docRef: string
  store: DriftStore
  /** 追加 update 达到该阈值后压实为全量快照。 */
  compactionThreshold?: number
}

/**
 * DriftPersistence：把 Y.Doc 的增量 update 追加写入本地存储，
 * 并提供 restore 从本地状态重建文档。持久化与同步解耦：
 * 与远端对账（Reconnect Handshake）由 Provider 层负责。
 * restore 应用 update 时标记 origin，避免恢复内容被再次持久化。
 */
export class DriftPersistence {
  public readonly docRef: string
  private readonly doc: Y.Doc
  private readonly store: DriftStore
  private readonly compactionThreshold: number
  private statusValue: DriftStatus = 'idle'
  private readonly statusListeners = new Set<DriftStatusListener>()
  private pendingUpdates = 0
  private destroyed = false

  public constructor(doc: Y.Doc, options: DriftPersistenceOptions) {
    this.doc = doc
    this.docRef = options.docRef
    this.store = options.store
    this.compactionThreshold =
      options.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD
    doc.on('update', this.handleDocUpdate)
  }

  public get status(): DriftStatus {
    return this.statusValue
  }

  public subscribeStatus(listener: DriftStatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.statusValue)
    return () => this.statusListeners.delete(listener)
  }

  /**
   * 从本地存储恢复文档状态。返回恢复的 update 条数；
   * 无本地记录时返回 0 并保持文档不变。
   */
  public async restore(): Promise<number> {
    if (this.destroyed) {
      throw new Error('DriftPersistence is destroyed')
    }
    this.setStatus('restoring')
    try {
      const persisted = await this.store.load(this.docRef)
      if (!persisted) {
        this.setStatus('ready')
        return 0
      }
      let restored = 0
      if (persisted.snapshot && persisted.snapshot.byteLength > 0) {
        applyDocUpdate(this.doc, persisted.snapshot, DRIFT_ORIGIN)
        restored += 1
      }
      for (const update of persisted.updates) {
        applyDocUpdate(this.doc, update, DRIFT_ORIGIN)
        restored += 1
      }
      this.pendingUpdates = persisted.updates.length
      this.setStatus('ready')
      return restored
    } catch (error) {
      this.setStatus('error')
      throw error
    }
  }

  /** 等待本地存储的全部已入队写入完成。 */
  public async flush(): Promise<void> {
    await this.store.flush()
  }

  public destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.doc.off('update', this.handleDocUpdate)
    this.statusListeners.clear()
  }

  private readonly handleDocUpdate = (
    update: Uint8Array,
    origin: unknown,
  ): void => {
    if (this.destroyed || origin === DRIFT_ORIGIN) {
      return
    }
    void this.persistUpdate(update)
  }

  private async persistUpdate(update: Uint8Array): Promise<void> {
    const count = await this.store.append(this.docRef, update)
    this.pendingUpdates = count
    if (this.pendingUpdates >= this.compactionThreshold) {
      const snapshot = encodeDocUpdate(this.doc)
      await this.store.compact(this.docRef, snapshot)
      this.pendingUpdates = 0
    }
  }

  private setStatus(status: DriftStatus): void {
    this.statusValue = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }
}

const DRIFT_ORIGIN = Symbol('drift-restore')

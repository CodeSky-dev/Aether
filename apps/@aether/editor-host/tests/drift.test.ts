// @aether/editor-host · Drift 持久化测试。
// 使用 fake-indexeddb 在 Node 环境模拟 IndexedDB，覆盖存储层与持久化层。
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyDocUpdate,
  appendPartitionText,
  createDoc,
  encodeDocUpdate,
  readPartitionText,
} from '@aether/current-sync'
import {
  DriftPersistence,
  IndexedDbDriftStore,
  type DriftStore,
} from '../src/core/drift'
import { createRealmDoc, docRefForRealm } from '../src/core/doc'
import type { EditorHost } from '../src/core/host'

const TEST_DB = 'aether-drift-test'

async function deleteTestDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(TEST_DB)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/** 打开测试库的 store，用例结束后无论是否断言失败都关闭连接。 */
async function withStore<T>(
  fn: (store: IndexedDbDriftStore) => Promise<T>,
): Promise<T> {
  const store = new IndexedDbDriftStore({ dbName: TEST_DB })
  await store.open()
  try {
    return await fn(store)
  } finally {
    await store.close()
  }
}

describe('IndexedDbDriftStore', () => {
  afterEach(deleteTestDb)

  it('空库 load 返回 null，append 后按序返回 update', async () => {
    await withStore(async (store) => {
      const docRef = 'realm:demo'
      expect(await store.load(docRef)).toBeNull()

      const first = new Uint8Array([1, 2, 3])
      const second = new Uint8Array([4, 5])
      expect(await store.append(docRef, first)).toBe(1)
      expect(await store.append(docRef, second)).toBe(2)

      const result = await store.load(docRef)
      expect(result).not.toBeNull()
      expect(result?.snapshot).toBeNull()
      expect(result?.updates).toHaveLength(2)
      expect(Array.from(result?.updates[0] ?? [])).toEqual([1, 2, 3])
      expect(Array.from(result?.updates[1] ?? [])).toEqual([4, 5])
    })
  })

  it('compact 写入快照并清空追加 update，load 返回快照与空数组', async () => {
    await withStore(async (store) => {
      const docRef = 'realm:demo'
      await store.append(docRef, new Uint8Array([1]))
      await store.compact(docRef, new Uint8Array([9, 9, 9]))

      const result = await store.load(docRef)
      expect(Array.from(result?.snapshot ?? [])).toEqual([9, 9, 9])
      expect(result?.updates).toHaveLength(0)

      await store.append(docRef, new Uint8Array([2]))
      const after = await store.load(docRef)
      expect(Array.from(after?.updates[0] ?? [])).toEqual([2])
      expect(Array.from(after?.snapshot ?? [])).toEqual([9, 9, 9])
    })
  })

  it('clear 删除记录，load 回到 null', async () => {
    await withStore(async (store) => {
      const docRef = 'realm:demo'
      await store.append(docRef, new Uint8Array([1]))
      await store.clear(docRef)
      expect(await store.load(docRef)).toBeNull()
    })
  })

  it('新实例共享同一数据库：离线写入在重建实例后仍可读', async () => {
    const docRef = 'realm:persist'
    const first = new IndexedDbDriftStore({ dbName: TEST_DB })
    await first.open()
    await first.append(docRef, new Uint8Array([1, 2]))
    await first.compact(docRef, new Uint8Array([7, 7]))
    await first.append(docRef, new Uint8Array([3]))
    await first.flush()
    await first.close()

    const second = new IndexedDbDriftStore({ dbName: TEST_DB })
    try {
      const result = await second.load(docRef)
      expect(Array.from(result?.snapshot ?? [])).toEqual([7, 7])
      expect(Array.from(result?.updates[0] ?? [])).toEqual([3])
    } finally {
      await second.close()
    }
  })

  it('多个 doc_ref 相互隔离', async () => {
    await withStore(async (store) => {
      await store.append('realm:a', new Uint8Array([1]))
      await store.append('realm:b', new Uint8Array([2]))
      const a = await store.load('realm:a')
      const b = await store.load('realm:b')
      expect(a?.updates[0]?.[0]).toBe(1)
      expect(b?.updates[0]?.[0]).toBe(2)
    })
  })
})

describe('DriftPersistence', () => {
  afterEach(deleteTestDb)

  it('无本地记录时 restore 返回 0 且文档不变', async () => {
    await withStore(async (store) => {
      const doc = createRealmDoc(docRefForRealm('empty'))
      const persistence = new DriftPersistence(doc, { docRef: doc.guid, store })
      const restored = await persistence.restore()
      expect(restored).toBe(0)
      expect(persistence.status).toBe('ready')
      persistence.destroy()
    })
  })

  it('编辑写入本地，重建文档后 restore 恢复全部内容', async () => {
    await withStore(async (store) => {
      const docRef = docRefForRealm('realm')

      const source = createRealmDoc(docRef)
      const persistence = new DriftPersistence(source, { docRef, store })
      await persistence.restore()
      appendPartitionText(source, 'code', 'content', 'hello ')
      appendPartitionText(source, 'code', 'content', 'world')
      await persistence.flush()
      persistence.destroy()

      const recovered = createRealmDoc(docRef)
      const recovery = new DriftPersistence(recovered, { docRef, store })
      const restored = await recovery.restore()
      expect(restored).toBeGreaterThan(0)
      expect(readPartitionText(recovered, 'code', 'content')).toBe(
        'hello world',
      )
      recovery.destroy()
    })
  })

  it('restore 应用本地 update 不会再次触发持久化（origin 过滤）', async () => {
    await withStore(async (store) => {
      const docRef = docRefForRealm('realm')

      const source = createRealmDoc(docRef)
      const persistence = new DriftPersistence(source, { docRef, store })
      await persistence.restore()
      appendPartitionText(source, 'code', 'content', 'only-once')
      await persistence.flush()
      persistence.destroy()

      const before = await store.load(docRef)
      expect(before?.updates).toHaveLength(1)

      const recovered = createRealmDoc(docRef)
      const recovery = new DriftPersistence(recovered, { docRef, store })
      await recovery.restore()
      await recovery.flush()
      recovery.destroy()

      const after = await store.load(docRef)
      expect(after?.updates).toHaveLength(1)
      expect(readPartitionText(recovered, 'code', 'content')).toBe('only-once')
    })
  })

  it('达到压实阈值后写全量快照，恢复仍正确', async () => {
    await withStore(async (store) => {
      const docRef = docRefForRealm('compact')

      const source = createRealmDoc(docRef)
      const persistence = new DriftPersistence(source, {
        docRef,
        store,
        compactionThreshold: 2,
      })
      await persistence.restore()
      for (let index = 0; index < 5; index += 1) {
        appendPartitionText(source, 'code', 'content', `编辑-${index};`)
        await persistence.flush()
      }
      persistence.destroy()

      const record = await store.load(docRef)
      expect(record?.updates).toHaveLength(1)
      expect(record?.snapshot).not.toBeNull()

      const recovered = createRealmDoc(docRef)
      const recovery = new DriftPersistence(recovered, { docRef, store })
      const restored = await recovery.restore()
      expect(restored).toBeGreaterThan(0)
      expect(readPartitionText(recovered, 'code', 'content')).toBe(
        '编辑-0;编辑-1;编辑-2;编辑-3;编辑-4;',
      )
      recovery.destroy()
    })
  })

  it('订阅状态：restoring → ready，错误时进入 error', async () => {
    const docRef = docRefForRealm('realm')
    const states: string[] = []
    const failingStore: DriftStore = {
      open: () => Promise.resolve(),
      load: () => Promise.reject(new Error('load failed')),
      append: () => Promise.resolve(0),
      compact: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      flush: () => Promise.resolve(),
      close: () => Promise.resolve(),
    }
    const doc = createRealmDoc(docRef)
    const persistence = new DriftPersistence(doc, { docRef, store: failingStore })
    persistence.subscribeStatus((status) => states.push(status))
    await expect(persistence.restore()).rejects.toThrow('load failed')
    expect(states).toContain('restoring')
    expect(states).toContain('error')
    expect(persistence.status).toBe('error')
    persistence.destroy()
  })

  it('destroy 后不再持久化新增 update', async () => {
    await withStore(async (store) => {
      const docRef = docRefForRealm('realm')
      const doc = createRealmDoc(docRef)
      const persistence = new DriftPersistence(doc, { docRef, store })
      await persistence.restore()
      persistence.destroy()
      appendPartitionText(doc, 'code', 'content', 'ignored')
      await store.flush()
      const record = await store.load(docRef)
      expect(record).toBeNull()
    })
  })

  it('快照与追加 update 混合时恢复先应用快照再应用追加 update', async () => {
    await withStore(async (store) => {
      const docRef = docRefForRealm('hybrid')
      const doc = createRealmDoc(docRef)
      const persistence = new DriftPersistence(doc, {
        docRef,
        store,
        compactionThreshold: 2,
      })
      await persistence.restore()
      appendPartitionText(doc, 'code', 'content', 'a')
      await persistence.flush()
      appendPartitionText(doc, 'code', 'content', 'b')
      await persistence.flush()
      appendPartitionText(doc, 'code', 'content', 'c')
      await persistence.flush()
      persistence.destroy()

      const record = await store.load(docRef)
      expect(record?.snapshot).not.toBeNull()
      expect(record?.updates).toHaveLength(1)

      const recovered = createRealmDoc(docRef)
      const recovery = new DriftPersistence(recovered, { docRef, store })
      await recovery.restore()
      expect(readPartitionText(recovered, 'code', 'content')).toBe('abc')
      recovery.destroy()
    })
  })

  it('编码快照与 doc 同步：encodeDocUpdate 结果可被 applyDocUpdate 还原', () => {
    const docRef = docRefForRealm('roundtrip')
    const source = createRealmDoc(docRef)
    appendPartitionText(source, 'code', 'content', 'roundtrip')
    const encoded = encodeDocUpdate(source)

    const target = createDoc()
    target.guid = docRef
    applyDocUpdate(target, encoded, Symbol('test'))
    expect(readPartitionText(target, 'code', 'content')).toBe('roundtrip')
  })
})

describe('EditorHost Drift 集成', () => {
  afterEach(deleteTestDb)

  it('drift 关闭时 drift 为 null，restoreDrift 返回 0', async () => {
    const { EditorHost } = await import('../src/core/host')
    const host = new EditorHost({
      realmSlug: 'demo',
      actorId: 'actor-1',
      filePath: 'src/index.ts',
    })
    expect(host.drift).toBeNull()
    expect(await host.restoreDrift()).toBe(0)
    expect(host.driftStatus).toBeNull()
    host.destroy()
  })

  it('drift 启用时写入本地，新实例 restore 恢复内容', async () => {
    const { EditorHost } = await import('../src/core/host')
    const first: EditorHost = new EditorHost({
      realmSlug: 'demo',
      actorId: 'actor-1',
      filePath: 'src/index.ts',
      drift: { enabled: true, dbName: TEST_DB, compactionThreshold: 5 },
    })
    expect(first.drift).not.toBeNull()
    await first.restoreDrift()
    first.text.insert(0, 'persisted')
    await first.drift?.flush()
    first.destroy()

    const second: EditorHost = new EditorHost({
      realmSlug: 'demo',
      actorId: 'actor-2',
      filePath: 'src/index.ts',
      drift: { enabled: true, dbName: TEST_DB, compactionThreshold: 5 },
    })
    await second.restoreDrift()
    expect(second.text.toJSON()).toBe('persisted')
    second.destroy()
  })
})

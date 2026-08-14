// @aether/web · Current 状态通道客户端适配器
// 桥接本地 Y.Doc 与 Server Actions：本地变更落库，远端变更轮询拉取并应用。
// 使用 origin Symbol 防止回环（远端 update 不再回传服务器）。
// 轮询是探测文档定义的「非权威通道」——Hocuspocus 接入后承担实时推送。
'use client'

import type * as Y from 'yjs'
import {
  applyDocUpdate,
  deserializeUpdate,
  serializeUpdate,
  subscribeDocUpdates,
} from '@aether/current-sync'
import type { ActorType } from '@aether/types'
import {
  appendCurrentUpdate,
  getCurrentCursor,
  replayCurrentUpdates,
} from '@/app/actions/current'

const REMOTE_ORIGIN = Symbol('channel-remote')

export interface ChannelClientOptions {
  realmId: string
  docRef: string
  actorType: ActorType
  actorId: string
  /** 轮询间隔（毫秒），默认 2000 */
  pollIntervalMs?: number
  /** 单次重放上限，默认 100 */
  replayLimit?: number
  /** 自定义 idempotencyKey 生成器 */
  generateIdempotencyKey?: () => string
}

export interface ChannelClientStatus {
  /** 已落库的最新 seq */
  localSeq: number | null
  /** 已应用的远端最新 seq */
  remoteCursor: number | null
  /** 是否正在轮询 */
  polling: boolean
}

/**
 * 客户端 Current 通道适配器。
 * 监听本地 Y.Doc 变更 → 落库；轮询远端增量 → 应用到 Y.Doc。
 */
export class CurrentChannelClient {
  private readonly doc: Y.Doc
  private readonly options: Required<ChannelClientOptions>
  private readonly stopDocUpdates: () => void
  private remoteCursor: number | null = null
  private localSeq: number | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private idempotencyCounter = 0
  private destroyed = false

  public constructor(doc: Y.Doc, options: ChannelClientOptions) {
    this.doc = doc
    this.options = {
      pollIntervalMs: options.pollIntervalMs ?? 2000,
      replayLimit: options.replayLimit ?? 100,
      generateIdempotencyKey:
        options.generateIdempotencyKey ?? this.defaultIdempotencyKey.bind(this),
      realmId: options.realmId,
      docRef: options.docRef,
      actorType: options.actorType,
      actorId: options.actorId,
    }
    this.stopDocUpdates = subscribeDocUpdates(doc, (update, origin) => {
      if (origin !== REMOTE_ORIGIN && !this.destroyed) {
        void this.sendUpdate(update)
      }
    })
  }

  /**
   * 初始化：拉取当前游标 + 首次重放，然后启动轮询。
   */
  public async connect(): Promise<void> {
    const { cursor } = await getCurrentCursor(
      this.options.realmId,
      this.options.docRef,
    )
    this.remoteCursor = cursor
    await this.pollOnce()
    this.startPolling()
  }

  /**
   * 停止轮询并断开 Y.Doc 监听。
   */
  public disconnect(): void {
    this.stopPolling()
    this.stopDocUpdates()
    this.destroyed = true
  }

  public get status(): ChannelClientStatus {
    return {
      localSeq: this.localSeq,
      remoteCursor: this.remoteCursor,
      polling: this.polling,
    }
  }

  private async sendUpdate(update: Uint8Array): Promise<void> {
    const serializedPayload = serializeUpdate(update)
    const result = await appendCurrentUpdate({
      realmId: this.options.realmId,
      docRef: this.options.docRef,
      serializedPayload,
      actorType: this.options.actorType,
      actorId: this.options.actorId,
      idempotencyKey: this.options.generateIdempotencyKey(),
    })
    if (result.seq !== null) {
      this.localSeq = result.seq
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.polling || this.destroyed) {
      return
    }
    this.polling = true
    try {
      let hasMore = true
      while (hasMore && !this.destroyed) {
        const result = await replayCurrentUpdates(
          this.options.realmId,
          this.options.docRef,
          this.remoteCursor,
          this.options.replayLimit,
        )
        for (const item of result.updates) {
          if (item.idempotencyKey.startsWith(this.idempotencyPrefix)) {
            // 跳过自己发出的 update，避免回环
            continue
          }
          const payload = deserializeUpdateSafe(item.serializedPayload)
          if (payload) {
            applyDocUpdate(this.doc, payload, REMOTE_ORIGIN)
          }
          this.remoteCursor = item.seq
        }
        if (result.nextCursor !== null) {
          this.remoteCursor = result.nextCursor
        }
        hasMore = result.hasMore
      }
    } finally {
      this.polling = false
    }
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce()
    }, this.options.pollIntervalMs)
    if (
      typeof this.pollTimer === 'object' &&
      this.pollTimer !== null &&
      'unref' in this.pollTimer &&
      typeof this.pollTimer.unref === 'function'
    ) {
      this.pollTimer.unref()
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.polling = false
  }

  private get idempotencyPrefix(): string {
    return `${this.options.actorId}:`
  }

  private defaultIdempotencyKey(): string {
    this.idempotencyCounter += 1
    return `${this.idempotencyPrefix}${Date.now()}-${this.idempotencyCounter}`
  }
}

/**
 * 安全反序列化：解码失败时返回 null 而非抛异常。
 * 轮询场景下单条坏数据不应中断整个重放。
 */
function deserializeUpdateSafe(serialized: string): Uint8Array | null {
  try {
    return deserializeUpdate(serialized)
  } catch {
    return null
  }
}

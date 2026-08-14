// @aether/entity-core · Entity Presence Cursor
// Entity 在 Current 中持有光标与在场状态，人机协同从黑箱后台变为可观察的协作关系。
//
// 设计：
// - 包装 @aether/current-sync 的 PresenceChannel，提供 Entity 专用的 cursor 与心跳管理。
// - 不扩展 awareness 协议：Entity 与人类共享标准 PresenceSnapshot，
//   其他客户端通过 actorId 查询 members/entities 表得知是 Entity（actor_type='entity'）。
// - 心跳：Entity 长时间无操作时定期 refreshLocalPresence，避免被 PresenceChannel 的 sweep 清除。
// - 与 HandoffGate 联动：waiting/suspended 时调用 clearPresence 退出在场。
import { PresenceChannel } from '@aether/current-sync'
import type * as Y from 'yjs'

export interface EntityPresenceOptions {
  readonly entityId: string
  /** 心跳间隔（ms）；Entity 长时间无操作时定期 refresh，避免被 sweep */
  readonly heartbeatMs?: number
  /** PresenceChannel 超时（ms），传给 PresenceChannel */
  readonly timeoutMs?: number
  readonly now?: () => number
}

export interface EntityPresenceWrapOptions {
  readonly entityId: string
  readonly heartbeatMs?: number
}

export interface EntityCursor {
  readonly file: string
  readonly offset: number
}

const DEFAULT_HEARTBEAT_MS = 10_000

/**
 * Entity Presence Cursor：在 Current 中管理 Entity 的光标与在场状态。
 *
 * 两种构造方式：
 * - create(): 内部创建 PresenceChannel（拥有生命周期，destroy 时销毁）
 * - wrap(): 包装已存在的 PresenceChannel（不拥有生命周期，destroy 时只清 presence）
 */
export class EntityPresenceCursor {
  private readonly channel: PresenceChannel
  private readonly entityId: string
  private readonly heartbeatMs: number
  private readonly ownsChannel: boolean
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private currentCursor: EntityCursor | null = null

  private constructor(
    channel: PresenceChannel,
    entityId: string,
    heartbeatMs: number,
    ownsChannel: boolean,
  ) {
    this.channel = channel
    this.entityId = entityId
    this.heartbeatMs = heartbeatMs
    this.ownsChannel = ownsChannel
  }

  /** 创建新的 PresenceChannel 并包装 */
  public static create(
    doc: Y.Doc,
    options: EntityPresenceOptions,
  ): EntityPresenceCursor {
    const channel = new PresenceChannel(doc, {
      actorId: options.entityId,
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    })
    return new EntityPresenceCursor(
      channel,
      options.entityId,
      options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
      true,
    )
  }

  /** 包装已存在的 PresenceChannel（不拥有生命周期） */
  public static wrap(
    channel: PresenceChannel,
    options: EntityPresenceWrapOptions,
  ): EntityPresenceCursor {
    return new EntityPresenceCursor(
      channel,
      options.entityId,
      options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS,
      false,
    )
  }

  /** 获取底层 PresenceChannel（用于与 Provider 集成） */
  public getChannel(): PresenceChannel {
    return this.channel
  }

  public getEntityId(): string {
    return this.entityId
  }

  public getLocalCursor(): EntityCursor | null {
    return this.currentCursor
  }

  /**
   * 设置 Entity 光标位置。
   * 传入 null 表示清除光标（Entity 退出编辑但保持在场）。
   */
  public setCursor(cursor: EntityCursor | null): void {
    this.currentCursor = cursor
    if (cursor === null) {
      this.channel.setLocalPresence({ cursor: null, selection: null })
    } else {
      this.channel.setLocalPresence({
        cursor: { file: cursor.file, offset: cursor.offset },
        selection: null,
      })
    }
    this.ensureHeartbeat()
  }

  /** 刷新在场状态（重置 lastSeenAt，避免被 sweep） */
  public refresh(): boolean {
    if (this.currentCursor === null) {
      return false
    }
    return this.channel.refreshLocalPresence()
  }

  /** 清除在场状态（Entity 退出或被挂起时调用） */
  public clearPresence(): void {
    this.stopHeartbeat()
    this.currentCursor = null
    this.channel.clearLocalPresence()
  }

  /** 销毁：停止心跳，清理 presence。若拥有 channel 则一并销毁。 */
  public destroy(): void {
    this.stopHeartbeat()
    if (this.ownsChannel) {
      this.channel.destroy()
    } else {
      this.channel.clearLocalPresence()
    }
  }

  // ---- 内部 ----

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      return
    }
    const timer = setInterval(() => {
      this.channel.refreshLocalPresence()
    }, this.heartbeatMs)
    if (
      typeof timer === 'object' &&
      timer !== null &&
      'unref' in timer &&
      typeof timer.unref === 'function'
    ) {
      timer.unref()
    }
    this.heartbeatTimer = timer
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

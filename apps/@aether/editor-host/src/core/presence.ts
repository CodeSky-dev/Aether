// @aether/editor-host · Presence 通道。
// 基于 y-protocols Awareness 的在场状态管理：类型化发布/订阅。
// M0 提供本地（本标签页）状态写入 + 跨标签页同步；M1 接入 Presence Stream。
import type { Awareness } from 'y-protocols/awareness'
import type { PresenceSnapshot } from '@aether/types/yjs'

export type PresenceListener = (
  states: Map<number, PresenceSnapshot>,
) => void

export type PresenceFieldUpdate<K extends keyof PresenceSnapshot> = {
  field: K
  value: PresenceSnapshot[K]
}

/**
 * Presence 通道：把 Awareness 的原始状态映射为类型化 PresenceSnapshot。
 * 每个客户端以自己的 doc.clientID 为 key 发布/订阅在场状态。
 */
export class PresenceChannel {
  private readonly awareness: Awareness
  private listeners = new Set<PresenceListener>()
  private readonly onChange = () => this.emit()

  constructor(awareness: Awareness) {
    this.awareness = awareness
    this.awareness.on('change', this.onChange)
  }

  /** 当前客户端 ID（Yjs 内部分配） */
  get clientId(): number {
    return this.doc.clientID
  }

  /** 发布完整 PresenceSnapshot（覆盖式更新自己的在场状态） */
  setPresence(snapshot: PresenceSnapshot): void {
    this.awareness.setLocalState(snapshot)
  }

  /** 更新单个字段（保留其余字段） */
  updatePresence<K extends keyof PresenceSnapshot>(
    update: PresenceFieldUpdate<K>,
  ): void {
    const current = this.getLocalPresence()
    this.setPresence({
      actorId: current.actorId ?? 'unknown',
      cursor: current.cursor ?? null,
      selection: current.selection ?? null,
      lastSeenAt: current.lastSeenAt ?? Date.now(),
      [update.field]: update.value,
    })
  }

  /** 读取自己当前在场状态 */
  getLocalPresence(): Partial<PresenceSnapshot> {
    const raw = this.awareness.getLocalState()
    if (!raw) return {}
    return raw
  }

  /** 读取全部客户端在场状态快照 */
  getPresence(): Map<number, PresenceSnapshot> {
    return this.awareness.getStates() as Map<number, PresenceSnapshot>
  }

  /** 订阅在场变化，返回取消函数 */
  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener)
    listener(this.getPresence())
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    this.listeners.clear()
    this.awareness.off('change', this.onChange)
  }

  private get doc() {
    return this.awareness.doc
  }

  private emit(): void {
    const states = this.getPresence()
    for (const listener of this.listeners) {
      listener(states)
    }
  }
}

// @aether/web · 广播端口抽象
// Server Action 落库后经此端口通知其他连接的客户端。当前提供内存 pub/sub 实现
// （单实例场景）；Hocuspocus 接入后替换为 Redis pub/sub 或 WebSocket 广播。
// 这是探测文档定义的「非权威通知通道」seam——权威收敛仍走 Hocuspocus WebSocket。
import type { ActorType } from '@aether/types'

export interface BroadcastEvent {
  realmId: string
  docRef: string
  seq: number
  /** base64 序列化的 Yjs update（与 Server Action 入参同构） */
  serializedPayload: string
  actorType: ActorType
  actorId: string
  idempotencyKey: string
}

export type BroadcastListener = (event: BroadcastEvent) => void

export interface BroadcastPort {
  /** 订阅指定 Realm + doc 的广播事件，返回取消订阅函数 */
  subscribe(
    realmId: string,
    docRef: string,
    listener: BroadcastListener,
  ): () => void
  /** 发布一条广播事件（落库后调用） */
  publish(event: BroadcastEvent): void
}

/**
 * 内存广播端口：同一 Node 实例内的 pub/sub。
 * 适用于 Next.js dev 单实例、Fluid Compute 单实例复用场景。
 * 多实例部署时需替换为 Redis pub/sub 实现。
 */
export class InMemoryBroadcastPort implements BroadcastPort {
  private readonly listeners = new Map<string, Set<BroadcastListener>>()

  subscribe(
    realmId: string,
    docRef: string,
    listener: BroadcastListener,
  ): () => void {
    const key = channelKey(realmId, docRef)
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) {
        this.listeners.delete(key)
      }
    }
  }

  publish(event: BroadcastEvent): void {
    const key = channelKey(event.realmId, event.docRef)
    const set = this.listeners.get(key)
    if (!set) {
      return
    }
    for (const listener of set) {
      listener(event)
    }
  }
}

function channelKey(realmId: string, docRef: string): string {
  return `${realmId}:${docRef}`
}

/** 全局广播端口单例（Server Action 与客户端订阅共享同一实例） */
let globalPort: BroadcastPort | null = null

export function getBroadcastPort(): BroadcastPort {
  if (!globalPort) {
    globalPort = new InMemoryBroadcastPort()
  }
  return globalPort
}

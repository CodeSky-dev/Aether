// @aether/editor-host · Yjs Provider 基线 —— Provider 抽象。
// M0 用 BroadcastChannel 做同源多标签页同步（无需后端），
// 验证 Provider 生命周期与 Presence 通道。M1 由 @aether/current-sync
// 接入 Hocuspocus 收敛服务，本接口保持稳定作为替换边界。
import * as Y from 'yjs'
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  type Awareness,
} from 'y-protocols/awareness'

export interface ProviderOptions {
  /** BroadcastChannel 名，默认按 doc_ref 派生 */
  channelName?: string
}

/** Provider 生命周期接口（M0 基线，M1 扩展为 Hocuspocus 适配） */
export interface CurrentProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  /** 连接当前状态：connected / disconnected */
  readonly status: 'connected' | 'disconnected'
  connect(): void
  disconnect(): void
  destroy(): void
}

/**
 * BroadcastChannel Provider：同一浏览器多标签页共享一份 Y.Doc 与 Awareness。
 * 数据经结构化克隆在频道内传输，用于 M0 基线验证协同原语；
 * 生产收敛通道（Hocuspocus）在 M1 替换，本类不用于跨端。
 */
export class BroadcastChannelProvider implements CurrentProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  private channel: BroadcastChannel
  private _status: 'connected' | 'disconnected' = 'disconnected'
  private readonly onSync = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return
    this.channel.postMessage({ kind: 'sync', update })
  }
  private readonly onAwareness = (changes: {
    added: number[]
    updated: number[]
    removed: number[]
  }, origin: unknown) => {
    if (origin === this) return
    if (changes.added.length === 0 && changes.updated.length === 0 && changes.removed.length === 0) {
      return
    }
    const encoder = encodeAwarenessUpdate(
      this.awareness,
      [...changes.added, ...changes.updated, ...changes.removed],
    )
    this.channel.postMessage({ kind: 'awareness', update: encoder })
  }
  private readonly onMessage = (event: MessageEvent) => {
    const msg = event.data as { kind: string; update?: Uint8Array }
    if (!msg?.update) return
    if (msg.kind === 'sync') {
      Y.applyUpdate(this.doc, msg.update, this)
    } else if (msg.kind === 'awareness') {
      applyAwarenessUpdate(this.awareness, msg.update, this)
    }
  }

  constructor(doc: Y.Doc, awareness: Awareness, options: ProviderOptions = {}) {
    this.doc = doc
    this.awareness = awareness
    const channelName =
      options.channelName ?? `aether:${doc.guid ?? 'doc'}`
    this.channel = new BroadcastChannel(channelName)
  }

  get status(): 'connected' | 'disconnected' {
    return this._status
  }

  connect(): void {
    if (this._status === 'connected') return
    this.channel.addEventListener('message', this.onMessage)
    this.doc.on('update', this.onSync)
    this.awareness.on('update', this.onAwareness)
    this._status = 'connected'
  }

  disconnect(): void {
    if (this._status === 'disconnected') return
    this.channel.removeEventListener('message', this.onMessage)
    this.doc.off('update', this.onSync)
    this.awareness.off('update', this.onAwareness)
    this._status = 'disconnected'
  }

  destroy(): void {
    this.disconnect()
    this.channel.close()
  }
}

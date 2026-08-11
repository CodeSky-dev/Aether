// @aether/current-sync · 传输抽象与内存 loopback 实现。

export interface ProviderMessage {
  kind: 'document' | 'presence'
  payload: Uint8Array
}

export type ProviderMessageHandler = (message: ProviderMessage) => void

export interface ProviderTransport {
  connect(handler: ProviderMessageHandler): Promise<void> | void
  send(message: ProviderMessage): void
  disconnect(): void
}

class LoopbackTransport implements ProviderTransport {
  private handler: ProviderMessageHandler | null = null
  private peer: LoopbackTransport | null = null
  private connected = false
  private readonly queuedMessages: ProviderMessage[] = []

  connect(handler: ProviderMessageHandler): void {
    this.handler = handler
    this.connected = true
    for (const message of this.queuedMessages.splice(0)) {
      handler(message)
    }
  }

  send(message: ProviderMessage): void {
    if (!this.peer) {
      throw new Error('Loopback transport has no peer')
    }
    if (this.peer.connected && this.peer.handler) {
      this.peer.handler({
        kind: message.kind,
        payload: message.payload.slice(),
      })
    } else {
      this.peer.queuedMessages.push({
        kind: message.kind,
        payload: message.payload.slice(),
      })
    }
  }

  disconnect(): void {
    this.connected = false
    this.handler = null
  }

  setPeer(peer: LoopbackTransport): void {
    this.peer = peer
  }
}

/** 创建一对互相连接的内存传输，用于本地运行和测试。 */
export function createLoopbackTransportPair(): [
  ProviderTransport,
  ProviderTransport,
] {
  const first = new LoopbackTransport()
  const second = new LoopbackTransport()
  first.setPeer(second)
  second.setPeer(first)
  return [first, second]
}

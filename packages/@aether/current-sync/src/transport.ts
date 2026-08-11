// @aether/current-sync · 传输抽象与内存 loopback 实现。

export type ProviderMessage =
  | {
      kind: 'document'
      payload: Uint8Array
    }
  | {
      kind: 'presence'
      payload: Uint8Array
    }
  | {
      kind: 'sync-state-vector'
      requestId: string
      payload: string
    }
  | {
      kind: 'sync-update'
      requestId: string
      payload: string
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
      this.peer.handler(cloneMessage(message))
    } else {
      this.peer.queuedMessages.push(cloneMessage(message))
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

function cloneMessage(message: ProviderMessage): ProviderMessage {
  if (message.kind === 'document' || message.kind === 'presence') {
    return { kind: message.kind, payload: message.payload.slice() }
  }
  return { ...message }
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

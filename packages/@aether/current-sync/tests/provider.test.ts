import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendPartitionText,
  applyDocUpdate,
  createDoc,
  createLoopbackTransportPair,
  deserializeStateVector,
  deserializeUpdate,
  diffDocUpdate,
  encodeDocStateVector,
  encodeDocUpdate,
  serializeStateVector,
  serializeUpdate,
  type ProviderMessage,
  type ProviderMessageHandler,
  type ProviderTransport,
  YjsProvider,
} from '../src/index.js'

function recordMessages(
  transport: ProviderTransport,
): { transport: ProviderTransport; messages: ProviderMessage[] } {
  const messages: ProviderMessage[] = []
  return {
    messages,
    transport: {
      connect: (handler) => transport.connect(handler),
      send: (message) => {
        messages.push(message)
        transport.send(message)
      },
      disconnect: () => transport.disconnect(),
    },
  }
}

describe('@aether/current-sync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('通过 loopback 让两个 Provider 收敛同一个 Y.Doc', async () => {
    const [firstTransport, secondTransport] = createLoopbackTransportPair()
    const first = new YjsProvider({ actorId: 'first', transport: firstTransport })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    })

    await Promise.all([first.connect(), second.connect()])
    first.getPartition('code').set('file', 'index.ts')

    expect(second.getPartition('code').get('file')).toBe('index.ts')
    first.destroy()
    second.destroy()
  })

  it('双方互相看到 Presence，并在断连后清理', async () => {
    const [firstTransport, secondTransport] = createLoopbackTransportPair()
    const first = new YjsProvider({ actorId: 'first', transport: firstTransport })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    })
    const firstPresence: string[][] = []
    const secondPresence: string[][] = []
    first.subscribePresence((snapshots) =>
      firstPresence.push(snapshots.map((snapshot) => snapshot.actorId).sort()),
    )
    second.subscribePresence((snapshots) =>
      secondPresence.push(snapshots.map((snapshot) => snapshot.actorId).sort()),
    )

    await Promise.all([first.connect(), second.connect()])
    first.setLocalPresence({ cursor: null, selection: null })
    second.setLocalPresence({ cursor: null, selection: null })

    expect(firstPresence.at(-1)).toEqual(['first', 'second'])
    expect(secondPresence.at(-1)).toEqual(['first', 'second'])

    first.disconnect()
    expect(secondPresence.at(-1)).toEqual(['second'])
    second.destroy()
    first.destroy()
  })

  it('双方离线编辑后通过重连握手收敛', async () => {
    const [firstTransport, secondTransport] = createLoopbackTransportPair()
    const first = new YjsProvider({ actorId: 'first', transport: firstTransport })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    })

    await Promise.all([first.connect(), second.connect()])
    appendPartitionText(first.doc, 'code', 'file', 'shared-base;')
    first.disconnect()
    second.disconnect()
    appendPartitionText(first.doc, 'code', 'file', 'first-offline;')
    appendPartitionText(second.doc, 'code', 'file', 'second-offline;')

    await Promise.all([first.reconnect(), second.reconnect()])

    expect(first.getPartition('code').get('file')?.toString()).toContain(
      'first-offline;',
    )
    expect(first.getPartition('code').get('file')?.toString()).toContain(
      'second-offline;',
    )
    expect(second.getPartition('code').get('file')?.toString()).toBe(
      first.getPartition('code').get('file')?.toString(),
    )
    first.destroy()
    second.destroy()
  })

  it('被动对端只响应握手时，发起方的离线编辑也能送达', async () => {
    const serverDoc = createDoc()
    appendPartitionText(serverDoc, 'code', 'file', 'shared-base;')
    let clientHandler: ProviderMessageHandler | null = null
    let connected = false
    const passiveTransport: ProviderTransport = {
      connect: (handler) => {
        clientHandler = handler
        connected = true
      },
      send: (message) => {
        if (!connected) {
          return
        }
        if (message.kind === 'sync-state-vector') {
          const missingUpdate = diffDocUpdate(
            encodeDocUpdate(serverDoc),
            deserializeStateVector(message.payload),
          )
          clientHandler?.({
            kind: 'sync-update',
            requestId: message.requestId,
            stage: 'response',
            payload: serializeUpdate(missingUpdate),
            stateVector: serializeStateVector(
              encodeDocStateVector(serverDoc),
            ),
          })
        } else if (message.kind === 'sync-update' && message.stage === 'final') {
          applyDocUpdate(
            serverDoc,
            deserializeUpdate(message.payload),
            Symbol('passive-server'),
          )
        }
      },
      disconnect: () => {
        connected = false
        clientHandler = null
      },
    }
    const client = new YjsProvider({
      actorId: 'client',
      transport: passiveTransport,
    })
    applyDocUpdate(client.doc, encodeDocUpdate(serverDoc), Symbol('seed'))
    await client.connect()
    client.disconnect()
    appendPartitionText(client.doc, 'code', 'file', 'client-offline;')

    await client.reconnect()

    const clientContent = client.getPartition('code').get('file')?.toString()
    const serverContent = serverDoc.getMap('code').get('file')?.toString()
    expect(clientContent).toContain('client-offline;')
    expect(serverContent).toBe(clientContent)
    client.destroy()
    serverDoc.destroy()
  })

  it('握手只回传缺失增量，重复 connect 不产生额外握手消息', async () => {
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
    })

    for (let index = 0; index < 500; index += 1) {
      appendPartitionText(first.doc, 'code', 'file', `edit-${index};`)
    }
    const midpoint = encodeDocUpdate(first.doc)
    // 将同一客户端的前半段状态复制给第二端，保留可计算的增量 state vector。
    applyDocUpdate(second.doc, midpoint, Symbol('seed'))
    for (let index = 500; index < 1_000; index += 1) {
      appendPartitionText(first.doc, 'code', 'file', `edit-${index};`)
    }

    await Promise.all([first.connect(), second.connect()])
    const messageCount = firstTransport.messages.length + secondTransport.messages.length
    const firstStateVector = firstTransport.messages.find(
      (message): message is Extract<ProviderMessage, { kind: 'sync-state-vector' }> =>
        message.kind === 'sync-state-vector',
    )
    expect(firstStateVector).toBeDefined()
    rawFirst.send(firstStateVector!)
    expect(
      firstTransport.messages.length + secondTransport.messages.length,
    ).toBe(messageCount)
    await Promise.all([first.connect(), second.connect()])
    expect(
      firstTransport.messages.length + secondTransport.messages.length,
    ).toBe(messageCount)
    const fullSnapshotBytes = encodeDocUpdate(first.doc).byteLength
    const handshakeUpdates = [
      ...firstTransport.messages,
      ...secondTransport.messages,
    ]
      .filter(
        (message): message is Extract<ProviderMessage, { kind: 'sync-update' }> =>
          message.kind === 'sync-update',
      )
      .map((message) => deserializeUpdate(message.payload).byteLength)
      .filter((byteLength) => byteLength > 0)
    expect(handshakeUpdates.length).toBeGreaterThan(0)
    expect(Math.min(...handshakeUpdates)).toBeLessThan(fullSnapshotBytes)

    first.destroy()
    second.destroy()
  })

  it('新实例重连后自动恢复 Presence', async () => {
    const [firstTransport, secondTransport] = createLoopbackTransportPair()
    const first = new YjsProvider({ actorId: 'first', transport: firstTransport })
    const oldSecond = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    })
    await Promise.all([first.connect(), oldSecond.connect()])
    first.setLocalPresence({ cursor: null, selection: null })
    expect(oldSecond.presence.getSnapshots()).toHaveLength(1)

    first.disconnect()
    oldSecond.disconnect()
    oldSecond.destroy()
    const newSecond = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    })
    await Promise.all([first.reconnect(), newSecond.connect()])
    expect(newSecond.presence.getSnapshots().map((item) => item.actorId)).toEqual(
      ['first'],
    )

    first.destroy()
    newSecond.destroy()
  })

  it('握手序列化版本不匹配时显式失败', async () => {
    let handler: ((message: ProviderMessage) => void) | null = null
    const transport: ProviderTransport = {
      connect: (nextHandler) => {
        handler = nextHandler
      },
      send: (message) => {
        if (message.kind === 'sync-state-vector') {
          handler?.({
            kind: 'sync-state-vector',
            requestId: 'invalid-version',
            payload: JSON.stringify({ schemaVersion: 999, data: '' }),
          })
        }
      },
      disconnect: () => {},
    }
    const provider = new YjsProvider({ actorId: 'first', transport })
    await expect(provider.connect()).rejects.toThrow(
      'CRDT schema version mismatch',
    )
    provider.destroy()
  })

  it('握手超时后 reject，迟到响应不会恢复连接', async () => {
    let handler: ProviderMessageHandler | null = null
    let requestId = ''
    const sentMessages: ProviderMessage[] = []
    const transport: ProviderTransport = {
      connect: (nextHandler) => {
        handler = nextHandler
      },
      send: (message) => {
        sentMessages.push(message)
        if (message.kind === 'sync-state-vector') {
          requestId = message.requestId
        }
      },
      disconnect: () => {},
    }
    const provider = new YjsProvider({
      actorId: 'first',
      transport,
      handshakeTimeoutMs: 10,
    })
    provider.disconnect()
    expect(sentMessages).toHaveLength(0)

    await expect(provider.connect()).rejects.toThrow('timed out')
    expect(provider.connectionState).toBe('disconnected')
    const sentAfterTimeout = sentMessages.length
    const lateHandler = handler as unknown as ProviderMessageHandler
    lateHandler({
      kind: 'sync-state-vector',
      requestId: 'late-request',
      payload: serializeStateVector(new Uint8Array()),
    })
    lateHandler({
      kind: 'sync-update',
      requestId,
      stage: 'response',
      payload: serializeUpdate(new Uint8Array()),
      stateVector: serializeStateVector(new Uint8Array()),
    })
    expect(sentMessages).toHaveLength(sentAfterTimeout)
    expect(provider.connectionState).toBe('disconnected')
    provider.destroy()
  })

  it('淘汰超过超时窗口的 Presence', async () => {
    let now = 1_000
    const [firstTransport, secondTransport] = createLoopbackTransportPair()
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport,
      now: () => now,
      timeoutMs: 100,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
      now: () => now,
      timeoutMs: 100,
    })

    await Promise.all([first.connect(), second.connect()])
    first.setLocalPresence({ cursor: null, selection: null })
    expect(second.presence.getSnapshots()).toHaveLength(1)
    now += 101
    second.presence.sweepExpired()
    expect(second.presence.getSnapshots()).toHaveLength(0)

    first.destroy()
    second.destroy()
  })

  it('波前窗口内合并多次 Presence，广播最后一次意图', async () => {
    vi.useFakeTimers()
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
      presenceThrottleMs: 50,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
      presenceThrottleMs: 50,
    })

    await Promise.all([first.connect(), second.connect()])
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 1 }, selection: null })
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 2 }, selection: null })
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 3 }, selection: null })

    const presenceMessages = (): ProviderMessage[] =>
      firstTransport.messages.filter((message) => message.kind === 'presence')
    expect(presenceMessages()).toHaveLength(1)
    expect(second.presence.getSnapshots()[0]?.cursor?.offset).toBe(1)
    vi.advanceTimersByTime(49)
    expect(presenceMessages()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(presenceMessages()).toHaveLength(2)
    expect(second.presence.getSnapshots()[0]?.cursor?.offset).toBe(3)
    expect(second.presence.getSnapshots()[0]?.sequence).toBe(3)
    vi.advanceTimersByTime(100)
    expect(presenceMessages()).toHaveLength(2)

    first.destroy()
    second.destroy()
  })

  it('静止时停止普通广播，但按心跳发送 Presence', async () => {
    vi.useFakeTimers()
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
      timeoutMs: 300,
      presenceHeartbeatMs: 100,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
      timeoutMs: 300,
      presenceHeartbeatMs: 100,
    })

    await Promise.all([first.connect(), second.connect()])
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 1 }, selection: null })
    const presenceMessages = (): ProviderMessage[] =>
      firstTransport.messages.filter((message) => message.kind === 'presence')
    expect(presenceMessages()).toHaveLength(1)
    vi.advanceTimersByTime(99)
    expect(presenceMessages()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(presenceMessages()).toHaveLength(2)
    vi.advanceTimersByTime(100)
    expect(presenceMessages()).toHaveLength(3)
    expect(second.presence.getSnapshots()[0]?.sequence).toBe(3)

    first.destroy()
    second.destroy()
  })

  it('按 actor 序号丢弃乱序旧 Presence，接受更新序号', () => {
    const source = new YjsProvider({
      actorId: 'source',
      transport: createLoopbackTransportPair()[0],
    })
    const receiver = new YjsProvider({
      actorId: 'receiver',
      transport: createLoopbackTransportPair()[0],
    })
    source.setLocalPresence({
      cursor: { file: 'a.ts', offset: 1 },
      selection: null,
    })
    const firstUpdate = source.presence.encodeUpdate()
    source.setLocalPresence({
      cursor: { file: 'a.ts', offset: 2 },
      selection: null,
    })
    const secondUpdate = source.presence.encodeUpdate()

    receiver.presence.applyUpdate(secondUpdate, Symbol('test'))
    receiver.presence.applyUpdate(firstUpdate, Symbol('test'))
    expect(receiver.presence.getSnapshots()[0]?.cursor?.offset).toBe(2)
    expect(receiver.presence.getSnapshots()[0]?.sequence).toBe(2)

    source.setLocalPresence({
      cursor: { file: 'a.ts', offset: 3 },
      selection: null,
    })
    receiver.presence.applyUpdate(source.presence.encodeUpdate(), Symbol('test'))
    expect(receiver.presence.getSnapshots()[0]?.cursor?.offset).toBe(3)
    expect(receiver.presence.getSnapshots()[0]?.sequence).toBe(3)
    source.destroy()
    receiver.destroy()
  })

  it('同一 actor 的新会话序号从一开始时仍能恢复 Presence', () => {
    const receiver = new YjsProvider({
      actorId: 'receiver',
      transport: createLoopbackTransportPair()[0],
    })
    const firstSession = new YjsProvider({
      actorId: 'shared-actor',
      transport: createLoopbackTransportPair()[0],
    })
    firstSession.setLocalPresence({
      cursor: { file: 'a.ts', offset: 1 },
      selection: null,
    })
    receiver.presence.applyUpdate(
      firstSession.presence.encodeUpdate(),
      Symbol('test'),
    )
    firstSession.presence.clearLocalPresence()
    receiver.presence.applyUpdate(
      firstSession.presence.encodeUpdate([firstSession.presence.getLocalClientId()]),
      Symbol('test'),
    )
    expect(receiver.presence.getSnapshots()).toEqual([])

    const newSession = new YjsProvider({
      actorId: 'shared-actor',
      transport: createLoopbackTransportPair()[0],
    })
    newSession.setLocalPresence({
      cursor: { file: 'a.ts', offset: 2 },
      selection: null,
    })
    receiver.presence.applyUpdate(
      newSession.presence.encodeUpdate(),
      Symbol('test'),
    )
    expect(receiver.presence.getSnapshots()).toHaveLength(1)
    expect(receiver.presence.getSnapshots()[0]?.cursor?.offset).toBe(2)
    expect(receiver.presence.getSnapshots()[0]?.sequence).toBe(1)

    firstSession.destroy()
    newSession.destroy()
    receiver.destroy()
  })

  it('同一 actor 的并发 client 各自保留独立 Presence', () => {
    const receiver = new YjsProvider({
      actorId: 'receiver',
      transport: createLoopbackTransportPair()[0],
    })
    const firstClient = new YjsProvider({
      actorId: 'shared-actor',
      transport: createLoopbackTransportPair()[0],
    })
    const secondClient = new YjsProvider({
      actorId: 'shared-actor',
      transport: createLoopbackTransportPair()[0],
    })
    firstClient.setLocalPresence({
      cursor: { file: 'a.ts', offset: 1 },
      selection: null,
    })
    secondClient.setLocalPresence({
      cursor: { file: 'a.ts', offset: 2 },
      selection: null,
    })
    receiver.presence.applyUpdate(firstClient.presence.encodeUpdate(), Symbol('test'))
    receiver.presence.applyUpdate(secondClient.presence.encodeUpdate(), Symbol('test'))

    expect(
      receiver.presence
        .getSnapshots()
        .map((snapshot) => snapshot.cursor?.offset)
        .sort(),
    ).toEqual([1, 2])

    firstClient.destroy()
    secondClient.destroy()
    receiver.destroy()
  })

  it('持续高频移动时每个节流窗口只广播一条 Presence', async () => {
    vi.useFakeTimers()
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
      presenceThrottleMs: 50,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
      presenceThrottleMs: 50,
    })
    await Promise.all([first.connect(), second.connect()])

    for (let offset = 0; offset < 10; offset += 1) {
      first.setLocalPresence({
        cursor: { file: 'a.ts', offset },
        selection: null,
      })
      vi.advanceTimersByTime(10)
    }
    const presenceMessages = (): ProviderMessage[] =>
      firstTransport.messages.filter((message) => message.kind === 'presence')
    expect(presenceMessages()).toHaveLength(3)
    expect(second.presence.getSnapshots()[0]?.cursor?.offset).toBe(9)

    first.destroy()
    second.destroy()
  })

  it('未连接时不广播也不堆积 Presence，连接后只重播最新意图', async () => {
    vi.useFakeTimers()
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
      presenceThrottleMs: 50,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
      presenceThrottleMs: 50,
    })
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 1 }, selection: null })
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 2 }, selection: null })
    vi.advanceTimersByTime(500)
    expect(
      firstTransport.messages.filter((message) => message.kind === 'presence'),
    ).toHaveLength(0)

    await Promise.all([first.connect(), second.connect()])
    expect(second.presence.getSnapshots()[0]?.cursor?.offset).toBe(2)
    expect(second.presence.getSnapshots()[0]?.sequence).toBe(3)
    expect(
      firstTransport.messages.filter((message) => message.kind === 'presence'),
    ).toHaveLength(1)

    first.destroy()
    second.destroy()
  })

  it('重连后重播最新 Presence 并递增序号，destroy 后不再发送', async () => {
    vi.useFakeTimers()
    const [rawFirst, rawSecond] = createLoopbackTransportPair()
    const firstTransport = recordMessages(rawFirst)
    const secondTransport = recordMessages(rawSecond)
    const first = new YjsProvider({
      actorId: 'first',
      transport: firstTransport.transport,
      presenceThrottleMs: 50,
    })
    const second = new YjsProvider({
      actorId: 'second',
      transport: secondTransport.transport,
      presenceThrottleMs: 50,
    })

    await Promise.all([first.connect(), second.connect()])
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 1 }, selection: null })
    first.setLocalPresence({ cursor: { file: 'a.ts', offset: 2 }, selection: null })
    first.disconnect()
    second.disconnect()
    await Promise.all([first.reconnect(), second.reconnect()])
    expect(second.presence.getSnapshots()[0]?.cursor?.offset).toBe(2)
    expect(second.presence.getSnapshots()[0]?.sequence).toBe(3)

    first.destroy()
    const sentAfterDestroy = firstTransport.messages.length
    vi.advanceTimersByTime(100_000)
    expect(firstTransport.messages.length).toBe(sentAfterDestroy)
    second.destroy()
  })
})

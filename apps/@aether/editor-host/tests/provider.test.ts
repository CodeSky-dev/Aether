import { describe, expect, it } from 'vitest'
import { YjsProvider } from '../src/index.js'
import { createLoopbackTransportPair } from '../src/transport.js'

describe('@aether/editor-host', () => {
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
})

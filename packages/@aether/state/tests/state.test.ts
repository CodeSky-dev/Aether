import {
  createLoopbackTransportPair,
  readPartitionField,
  writePartitionField,
  YjsProvider,
} from '@aether/current-sync'
import { describe, expect, it } from 'vitest'
import { createCurrentStateStore } from '../src/index.js'

function createProviderPair(): [YjsProvider, YjsProvider] {
  const [firstTransport, secondTransport] = createLoopbackTransportPair()
  return [
    new YjsProvider({
      actorId: 'first',
      transport: firstTransport,
    }),
    new YjsProvider({
      actorId: 'second',
      transport: secondTransport,
    }),
  ]
}

describe('@aether/state', () => {
  it('投影连接状态与 Presence，并在解绑后停止更新', async () => {
    const [first, second] = createProviderPair()
    const store = createCurrentStateStore()
    store.getState().bind(first, { partition: 'code', fieldPath: 'content' })

    expect(store.getState().connectionState).toBe('disconnected')
    await Promise.all([first.connect(), second.connect()])
    expect(store.getState().connectionState).toBe('connected')

    first.setLocalPresence({
      cursor: { file: 'main.ts', offset: 3 },
      selection: null,
    })
    expect(store.getState().presence[0]?.actorId).toBe('first')
    expect(store.getState().presence[0]?.sequence).toBe(1)

    store.getState().unbind()
    expect(store.getState().connectionState).toBe('disconnected')
    first.setLocalPresence({
      cursor: { file: 'main.ts', offset: 4 },
      selection: null,
    })
    expect(store.getState().presence).toEqual([])

    first.destroy()
    second.destroy()
  })

  it('将本地字段写入交给 provider 的 Y.Doc 并投影读回', () => {
    const [first, second] = createProviderPair()
    const store = createCurrentStateStore()
    store.getState().bind(first, { partition: 'code', fieldPath: 'content' })

    store.getState().setFieldValue('hello')

    expect(readPartitionField(first.doc, 'code', 'content')).toBe('hello')
    expect(store.getState().fieldValue).toBe('hello')

    first.destroy()
    second.destroy()
  })

  it('远端文档更新到达后刷新字段投影', async () => {
    const [first, second] = createProviderPair()
    const store = createCurrentStateStore()
    store.getState().bind(second, { partition: 'code', fieldPath: 'content' })
    await Promise.all([first.connect(), second.connect()])

    writePartitionField(first.doc, 'code', 'content', {
      status: 'ready',
      count: 2,
    })

    expect(store.getState().fieldValue).toEqual({
      status: 'ready',
      count: 2,
    })

    store.getState().unbind()
    writePartitionField(first.doc, 'code', 'content', 'stale')
    expect(store.getState().fieldValue).toBeUndefined()

    first.destroy()
    second.destroy()
  })

  it('无关分区、元数据或未变更字段的更新不会触发字段投影刷新', async () => {
    const [first, second] = createProviderPair()
    const store = createCurrentStateStore()
    let fieldRefreshCount = 0
    store.subscribe((state, previousState) => {
      if (state.fieldValue !== previousState.fieldValue) {
        fieldRefreshCount += 1
      }
    })
    store.getState().bind(second, { partition: 'code', fieldPath: 'content' })
    await Promise.all([first.connect(), second.connect()])

    writePartitionField(first.doc, 'code', 'content', { status: 'ready' })
    expect(store.getState().fieldValue).toEqual({ status: 'ready' })
    const baseline = fieldRefreshCount

    writePartitionField(first.doc, 'realm', 'version', 2)
    expect(fieldRefreshCount).toBe(baseline)

    first.doc
      .getMap('__aether_current_sync_field_metadata')
      .set('code:content', 1)
    expect(fieldRefreshCount).toBe(baseline)

    writePartitionField(first.doc, 'code', 'content', { status: 'ready' })
    expect(fieldRefreshCount).toBe(baseline)

    writePartitionField(first.doc, 'code', 'content', { status: 'done' })
    expect(fieldRefreshCount).toBe(baseline + 1)

    store.getState().unbind()
    first.destroy()
    second.destroy()
  })

  it('投影文档对象时不会被 __proto__ 键污染原型', () => {
    const [first] = createProviderPair()
    const store = createCurrentStateStore()
    store.getState().bind(first, { partition: 'code', fieldPath: 'content' })

    const malicious = { name: 'safe' }
    Object.defineProperty(malicious, '__proto__', {
      value: { polluted: true },
      enumerable: true,
      writable: true,
      configurable: true,
    })
    writePartitionField(first.doc, 'code', 'content', malicious)

    const value = store.getState().fieldValue as Record<string, unknown>
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(value.polluted).toBeUndefined()

    store.getState().unbind()
    first.destroy()
  })
})

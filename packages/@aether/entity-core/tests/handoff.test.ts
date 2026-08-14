// @aether/entity-core · Handoff Gate 状态机单元测试
import { describe, it, expect } from 'vitest'
import {
  HandoffGate,
  HandoffGateError,
  type HandoffEvent,
  type HandoffGateState,
} from '../src/handoff.js'

const ENTITY_ID = 'ent-00000000-0000-0000-0000-000000000001'
const HUMAN_ID = 'usr-00000000-0000-0000-0000-000000000002'

function createGate(options: {
  initialState?: HandoffGateState
  now?: () => number
  timeoutMs?: number
  generateRequestId?: () => string
} = {}): HandoffGate {
  return new HandoffGate({
    entityId: ENTITY_ID,
    initialState: options.initialState ?? 'idle',
    defaultTimeoutMs: options.timeoutMs ?? 60_000,
    now: options.now ?? (() => 1_000),
    generateRequestId:
      options.generateRequestId ?? (() => 'req-fixed-id'),
  })
}

describe('HandoffGate - 初始状态', () => {
  it('默认初始状态为 idle', () => {
    const gate = new HandoffGate({ entityId: ENTITY_ID })
    expect(gate.getState()).toBe('idle')
    expect(gate.isWaiting()).toBe(false)
    expect(gate.canAct()).toBe(false)
    expect(gate.getPendingRequest()).toBeNull()
  })

  it('可指定初始状态', () => {
    const gate = new HandoffGate({
      entityId: ENTITY_ID,
      initialState: 'active',
    })
    expect(gate.canAct()).toBe(true)
  })
})

describe('HandoffGate - start/stop', () => {
  it('idle → start → active', () => {
    const gate = createGate()
    gate.start()
    expect(gate.getState()).toBe('active')
    expect(gate.canAct()).toBe(true)
  })

  it('suspended → start → active（恢复）', () => {
    const gate = createGate({ initialState: 'suspended' })
    gate.start()
    expect(gate.getState()).toBe('active')
  })

  it('active → stop → idle', () => {
    const gate = createGate({ initialState: 'active' })
    gate.stop()
    expect(gate.getState()).toBe('idle')
  })

  it('waiting 状态不能 start', () => {
    const gate = createGate({ initialState: 'active' })
    gate.requestHandoff({ operation: 'op', payloadHash: 'hash' })
    expect(() => gate.start()).toThrow(HandoffGateError)
  })

  it('idle 状态不能 stop', () => {
    const gate = createGate({ initialState: 'idle' })
    expect(() => gate.stop()).toThrow(HandoffGateError)
  })
})

describe('HandoffGate - requestHandoff', () => {
  it('active → requestHandoff → waiting，持有 pending request', () => {
    const gate = createGate({ initialState: 'active' })
    const req = gate.requestHandoff({
      operation: 'delete-file',
      payloadHash: 'abc123',
    })
    expect(gate.getState()).toBe('waiting')
    expect(gate.isWaiting()).toBe(true)
    expect(gate.canAct()).toBe(false)
    expect(gate.getPendingRequest()).not.toBeNull()
    expect(gate.getPendingRequest()?.id).toBe(req.id)
    expect(gate.getPendingRequest()?.entityId).toBe(ENTITY_ID)
    expect(gate.getPendingRequest()?.operation).toBe('delete-file')
    expect(gate.getPendingRequest()?.payloadHash).toBe('abc123')
    expect(gate.getPendingRequest()?.requestedAt).toBe(1_000)
    expect(gate.getPendingRequest()?.expiresAt).toBe(1_000 + 60_000)
  })

  it('自定义超时覆盖默认值', () => {
    const gate = createGate({ initialState: 'active' })
    const req = gate.requestHandoff({
      operation: 'op',
      payloadHash: 'h',
      timeoutMs: 5_000,
    })
    expect(req.expiresAt).toBe(1_000 + 5_000)
  })

  it('waiting 状态不能再次 requestHandoff（单一 pending）', () => {
    const gate = createGate({ initialState: 'active' })
    gate.requestHandoff({ operation: 'op1', payloadHash: 'h1' })
    expect(() =>
      gate.requestHandoff({ operation: 'op2', payloadHash: 'h2' }),
    ).toThrow(HandoffGateError)
  })

  it('idle 状态不能 requestHandoff', () => {
    const gate = createGate({ initialState: 'idle' })
    expect(() =>
      gate.requestHandoff({ operation: 'op', payloadHash: 'h' }),
    ).toThrow(HandoffGateError)
  })
})

describe('HandoffGate - approve/reject', () => {
  it('waiting → approve → active，清空 pending', () => {
    const gate = createGate({ initialState: 'active' })
    const req = gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.approve({
      requestId: req.id,
      decidedBy: HUMAN_ID,
      decidedAt: 2_000,
    })
    expect(gate.getState()).toBe('active')
    expect(gate.getPendingRequest()).toBeNull()
  })

  it('waiting → reject → suspended，清空 pending', () => {
    const gate = createGate({ initialState: 'active' })
    const req = gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.reject({
      requestId: req.id,
      decidedBy: HUMAN_ID,
      decidedAt: 2_000,
      reason: 'unsafe operation',
    })
    expect(gate.getState()).toBe('suspended')
    expect(gate.getPendingRequest()).toBeNull()
  })

  it('approve 的 requestId 必须与 pending 匹配', () => {
    const gate = createGate({ initialState: 'active' })
    gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    expect(() =>
      gate.approve({
        requestId: 'wrong-id',
        decidedBy: HUMAN_ID,
        decidedAt: 2_000,
      }),
    ).toThrow(HandoffGateError)
    // 状态保持 waiting
    expect(gate.getState()).toBe('waiting')
  })

  it('active 状态不能 approve', () => {
    const gate = createGate({ initialState: 'active' })
    expect(() =>
      gate.approve({
        requestId: 'any',
        decidedBy: HUMAN_ID,
        decidedAt: 2_000,
      }),
    ).toThrow(HandoffGateError)
  })
})

describe('HandoffGate - timeout', () => {
  it('超过 expiresAt 时 checkTimeout 触发 suspended', () => {
    let currentTime = 1_000
    const gate = createGate({
      initialState: 'active',
      now: () => currentTime,
    })
    gate.requestHandoff({
      operation: 'op',
      payloadHash: 'h',
      timeoutMs: 5_000,
    })
    expect(gate.getState()).toBe('waiting')

    // 未超时
    currentTime = 4_000
    expect(gate.checkTimeout()).toBe(false)
    expect(gate.getState()).toBe('waiting')

    // 超时
    currentTime = 7_000
    expect(gate.checkTimeout()).toBe(true)
    expect(gate.getState()).toBe('suspended')
    expect(gate.getPendingRequest()).toBeNull()
  })

  it('waiting 以外状态 checkTimeout 返回 false', () => {
    const gate = createGate({ initialState: 'active' })
    expect(gate.checkTimeout()).toBe(false)
  })
})

describe('HandoffGate - suspend/resume', () => {
  it('active → suspend → suspended', () => {
    const gate = createGate({ initialState: 'active' })
    gate.suspend('security incident')
    expect(gate.getState()).toBe('suspended')
  })

  it('waiting → suspend → suspended（保留 pending 信息供审计）', () => {
    const gate = createGate({ initialState: 'active' })
    gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.suspend()
    expect(gate.getState()).toBe('suspended')
    // suspend 不清空 pending，供审计回溯
    expect(gate.getPendingRequest()).not.toBeNull()
  })

  it('suspended → resume → active，清空 pending', () => {
    const gate = createGate({ initialState: 'active' })
    gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.suspend()
    expect(gate.getPendingRequest()).not.toBeNull()
    gate.resume()
    expect(gate.getState()).toBe('active')
    expect(gate.getPendingRequest()).toBeNull()
  })

  it('suspended 状态不能 suspend', () => {
    const gate = createGate({ initialState: 'suspended' })
    expect(() => gate.suspend()).toThrow(HandoffGateError)
  })

  it('active 状态不能 resume', () => {
    const gate = createGate({ initialState: 'active' })
    expect(() => gate.resume()).toThrow(HandoffGateError)
  })
})

describe('HandoffGate - subscribe', () => {
  it('监听状态变更事件', () => {
    const gate = createGate({ initialState: 'idle' })
    const events: { state: HandoffGateState; event: HandoffEvent }[] = []
    gate.subscribe((state, event) => {
      events.push({ state, event })
    })

    gate.start()
    const req = gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.approve({
      requestId: req.id,
      decidedBy: HUMAN_ID,
      decidedAt: 2_000,
    })

    expect(events).toHaveLength(3)
    expect(events[0]!.event.type).toBe('start')
    expect(events[0]!.state).toBe('active')
    expect(events[1]!.event.type).toBe('request_handoff')
    expect(events[1]!.state).toBe('waiting')
    expect(events[2]!.event.type).toBe('approve')
    expect(events[2]!.state).toBe('active')
  })

  it('取消订阅后不再接收事件', () => {
    const gate = createGate({ initialState: 'idle' })
    let count = 0
    const unsubscribe = gate.subscribe(() => {
      count += 1
    })
    gate.start()
    expect(count).toBe(1)
    unsubscribe()
    gate.stop()
    expect(count).toBe(1)
  })
})

describe('HandoffGate - 完整生命周期', () => {
  it('idle → active → waiting → approve → active → stop', () => {
    const gate = createGate({ initialState: 'idle' })
    gate.start()
    expect(gate.canAct()).toBe(true)
    const req = gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    expect(gate.isWaiting()).toBe(true)
    gate.approve({
      requestId: req.id,
      decidedBy: HUMAN_ID,
      decidedAt: 2_000,
    })
    expect(gate.canAct()).toBe(true)
    gate.stop()
    expect(gate.getState()).toBe('idle')
  })

  it('idle → active → waiting → reject → suspended → resume → active', () => {
    const gate = createGate({ initialState: 'idle' })
    gate.start()
    const req = gate.requestHandoff({ operation: 'op', payloadHash: 'h' })
    gate.reject({
      requestId: req.id,
      decidedBy: HUMAN_ID,
      decidedAt: 2_000,
    })
    expect(gate.getState()).toBe('suspended')
    // 需 Realm Admin resume
    gate.resume()
    expect(gate.getState()).toBe('active')
  })
})

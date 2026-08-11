import { describe, expect, it } from 'vitest'
import { ConvergeEngine, RealmChannelRegistry } from '../src/index.js'

const baseOperation = {
  realm_id: 'realm-a',
  actor_type: 'entity' as const,
  actor_id: 'entity-a',
  partition: 'realm' as const,
  field_path: 'status',
  value: 'active',
  base_state_hash: null,
  payload_hash: 'payload-1',
}

describe('ConvergeEngine', () => {
  it('默认使用 CRDT 原生合并策略', () => {
    const channel = new RealmChannelRegistry().open('realm-a', 'current')
    const engine = new ConvergeEngine({ realmId: 'realm-a', channel })
    const result = engine.commit({
      ...baseOperation,
      idempotency_key: 'crdt-1',
    })

    expect(result.accepted).toBe(true)
    expect(result.strategy).toBe('crdt')
    expect(engine.getState('realm', 'status')).toBe('active')
  })

  it('按提交时间执行 LWW，并记录前置状态不匹配', () => {
    const engine = new ConvergeEngine({
      realmId: 'realm-a',
      channel: new RealmChannelRegistry().open('realm-a', 'current'),
      policies: [
        { partition: 'realm', fieldPath: 'status', strategy: 'lww' },
      ],
    })
    const first = engine.commit({
      ...baseOperation,
      idempotency_key: 'lww-1',
      submitted_at: 100,
    })
    const second = engine.commit({
      ...baseOperation,
      idempotency_key: 'lww-2',
      payload_hash: 'payload-2',
      value: 'idle',
      submitted_at: 200,
    })

    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(true)
    expect(second.conflict?.result.reason).toBe('stale_base_overwritten')
    expect(engine.getState('realm', 'status')).toBe('idle')
  })

  it('人工裁决策略不自动写入并产出审计形状冲突记录', () => {
    const engine = new ConvergeEngine({
      realmId: 'realm-a',
      channel: new RealmChannelRegistry().open('realm-a', 'current'),
    })
    engine.commit({
      ...baseOperation,
      idempotency_key: 'manual-seed',
    })
    engine.setPolicy({
      partition: 'realm',
      fieldPath: 'status',
      strategy: 'manual',
    })
    const result = engine.commit({
      ...baseOperation,
      idempotency_key: 'manual-1',
      payload_hash: 'payload-2',
      value: 'idle',
    })

    expect(result.accepted).toBe(false)
    expect(result.conflict).toMatchObject({
      realm_id: 'realm-a',
      actor_type: 'entity',
      actor_id: 'entity-a',
      action: 'write',
      payload_hash: 'payload-2',
      idempotency_key: 'manual-1',
      target: { partition: 'realm', field_path: 'status' },
    })
    expect(engine.getState('realm', 'status')).toBe('active')
  })

  it('按幂等键去重且拒绝错误 Realm', () => {
    const engine = new ConvergeEngine({
      realmId: 'realm-a',
      channel: new RealmChannelRegistry().open('realm-a', 'current'),
    })
    const operation = { ...baseOperation, idempotency_key: 'same-key' }
    const first = engine.commit(operation)
    const duplicate = engine.commit({ ...operation, value: 'changed' })

    expect(first.accepted).toBe(true)
    expect(duplicate.deduplicated).toBe(true)
    expect(engine.getState('realm', 'status')).toBe('active')
    expect(() =>
      engine.commit({ ...operation, realm_id: 'realm-b', idempotency_key: 'wrong-realm' }),
    ).toThrow('Realm mismatch')
    expect(
      () =>
        new ConvergeEngine({
          realmId: 'realm-a',
          channel: new RealmChannelRegistry().open('realm-b', 'current'),
        }),
    ).toThrow('Realm mismatch')
  })

  it('从 Y.Doc 读取状态、支持注入哈希并限制幂等缓存', () => {
    const registry = new RealmChannelRegistry()
    const channel = registry.open('realm-a', 'current')
    const engine = new ConvergeEngine({
      realmId: 'realm-a',
      channel,
      hashValue: (value) => `hash:${String(value)}`,
      maxIdempotencyEntries: 1,
    })

    const first = engine.commit({
      ...baseOperation,
      idempotency_key: 'bounded-1',
    })
    expect(first.stateHash).toBe('hash:active')
    expect(engine.getStateHash('realm', 'status')).toBe('hash:active')

    channel.writeField('realm', 'status', 'external')
    expect(engine.getState('realm', 'status')).toBe('external')

    engine.commit({
      ...baseOperation,
      idempotency_key: 'bounded-2',
      value: 'next',
      base_state_hash: 'hash:external',
    })
    const replay = engine.commit({
      ...baseOperation,
      idempotency_key: 'bounded-1',
    })
    expect(replay.deduplicated).toBe(false)
  })
})

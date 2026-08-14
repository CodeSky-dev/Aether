// @aether/entity-core · Entity Audit Trail 单元测试
// 用 drizzle-orm/pg-proxy mock 验证 recordAudit/queryAuditLog 的 SQL 构造与 Realm 隔离守卫。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import {
  computePayloadHash,
  hasEntityActionBeenRecorded,
  queryAuditLog,
  queryEntityAuditLog,
  recordAudit,
  recordEntityAction,
} from '../src/audit.js'

const AUDIT_COLUMN_ORDER = [
  'id',
  'realm_id',
  'actor_type',
  'actor_id',
  'action',
  'target',
  'payload_hash',
  'idempotency_key',
  'result',
  'created_at',
] as const

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_ENTITY = 'e0000000-0000-0000-0000-000000000001'
const TEST_HUMAN = 'h0000000-0000-0000-0000-000000000002'

interface MockStore {
  rows: Record<string, unknown>[]
}

function toArrayRow(record: Record<string, unknown>): unknown[] {
  return AUDIT_COLUMN_ORDER.map((key) => record[key])
}

function createMockDb(initialRows: Record<string, unknown>[] = []) {
  const store: MockStore = { rows: [...initialRows] }

  const callback: RemoteCallback = async (sql, params, _method) => {
    await Promise.resolve()

    // insert into "audit_log" ... returning *
    if (sql.includes('insert into "audit_log"')) {
      const newRow: Record<string, unknown> = {
        id: `id-${store.rows.length + 1}`,
        realm_id: params[0],
        actor_type: params[1],
        actor_id: params[2],
        action: params[3],
        target: params[4],
        payload_hash: params[5],
        idempotency_key: params[6],
        result: params[7],
        created_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.rows.push(newRow)
      return { rows: [toArrayRow(newRow)] }
    }

    // select ... from "audit_log" where ... order by ... [limit N]
    if (sql.includes('from "audit_log"')) {
      const realmId = params[0] as string
      let matching = store.rows.filter((r) => r.realm_id === realmId)

      // 解析额外条件（actor_type, actor_id, action, idempotency_key）
      // params 顺序与 realmScope + 条件组合相关；这里按 SQL 中出现的位置解析
      if (sql.includes('"actor_type"')) {
        const idx = params.indexOf('entity', 1) >= 0 ? params.indexOf('entity', 1) : params.indexOf('human', 1)
        if (idx > 0) {
          const actorType = params[idx] as string
          matching = matching.filter((r) => r.actor_type === actorType)
        }
      }
      if (sql.includes('"actor_id"')) {
        // 找到 actor_id 参数位置（在 realm_id 之后）
        const actorIdIdx = findParamIndex(params, [TEST_ENTITY, TEST_HUMAN])
        if (actorIdIdx > 0) {
          matching = matching.filter((r) => r.actor_id === params[actorIdIdx])
        }
      }
      if (sql.includes('"action"')) {
        // action 是第 5 列，params 中找 action 值
        const actionValues = ['read', 'write', 'permission_change', 'converse', 'execute']
        const actionIdx = params.findIndex((p, i) => i > 0 && actionValues.includes(p as string))
        if (actionIdx > 0) {
          matching = matching.filter((r) => r.action === params[actionIdx])
        }
      }
      if (sql.includes('"idempotency_key"')) {
        const idemIdx = params.findIndex((p, i) => i > 0 && typeof p === 'string' && p.startsWith('op-'))
        if (idemIdx > 0) {
          matching = matching.filter((r) => r.idempotency_key === params[idemIdx])
        }
      }

      // drizzle 将 limit 参数化为 `limit $N`，值在 params 末位
      if (sql.includes('limit')) {
        const limit = params[params.length - 1] as number
        matching = matching.slice(0, limit)
      }

      return { rows: matching.map(toArrayRow) }
    }

    return { rows: [] }
  }

  const db = drizzle(callback)
  return { db, store }
}

function findParamIndex(params: readonly unknown[], values: string[]): number {
  for (let i = 1; i < params.length; i++) {
    if (values.includes(params[i] as string)) {
      return i
    }
  }
  return -1
}

describe('computePayloadHash', () => {
  it('字符串 payload 生成 sha256 hex 摘要', () => {
    const hash = computePayloadHash('hello')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // sha256('hello') 已知值
    expect(hash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('Uint8Array payload 与对应字符串生成相同摘要', () => {
    const text = 'hello'
    const fromString = computePayloadHash(text)
    const fromBytes = computePayloadHash(new TextEncoder().encode(text))
    expect(fromBytes).toBe(fromString)
  })

  it('对象 payload 经 JSON 序列化后生成摘要', () => {
    const hash = computePayloadHash({ key: 'value' })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // 与手动 JSON.stringify 结果一致
    expect(hash).toBe(computePayloadHash(JSON.stringify({ key: 'value' })))
  })

  it('不同 payload 生成不同摘要', () => {
    expect(computePayloadHash('a')).not.toBe(computePayloadHash('b'))
  })
})

describe('recordAudit', () => {
  it('写入审计记录并返回完整记录', async () => {
    const { db, store } = createMockDb()
    const record = await recordAudit(db, TEST_REALM, {
      actorType: 'entity',
      actorId: TEST_ENTITY,
      action: 'write',
      target: { table: 'threads', id: 't1' },
      payload: 'some-payload',
      idempotencyKey: 'op-0001',
    })
    expect(record.actor_type).toBe('entity')
    expect(record.actor_id).toBe(TEST_ENTITY)
    expect(record.action).toBe('write')
    expect(record.payload_hash).toBe(computePayloadHash('some-payload'))
    expect(record.idempotency_key).toBe('op-0001')
    expect(store.rows).toHaveLength(1)
  })

  it('result 缺省时落库为空对象', async () => {
    const { db } = createMockDb()
    const record = await recordAudit(db, TEST_REALM, {
      actorType: 'entity',
      actorId: TEST_ENTITY,
      action: 'read',
      target: {},
      payload: 'p',
      idempotencyKey: 'op-0002',
    })
    expect(record.result).toEqual({})
  })

  it('result 提供时落库完整', async () => {
    const { db } = createMockDb()
    const record = await recordAudit(db, TEST_REALM, {
      actorType: 'entity',
      actorId: TEST_ENTITY,
      action: 'execute',
      target: {},
      payload: 'p',
      idempotencyKey: 'op-0003',
      result: { status: 'ok', duration: 42 },
    })
    expect(record.result).toEqual({ status: 'ok', duration: 42 })
  })
})

describe('recordEntityAction', () => {
  it('自动填充 actor_type=entity', async () => {
    const { db, store } = createMockDb()
    const record = await recordEntityAction(db, TEST_REALM, TEST_ENTITY, {
      action: 'converse',
      target: { thread_id: 't1' },
      payload: 'message-content',
      idempotencyKey: 'op-0004',
    })
    expect(record.actor_type).toBe('entity')
    expect(record.actor_id).toBe(TEST_ENTITY)
    expect(record.action).toBe('converse')
    expect(store.rows[0]!.actor_type).toBe('entity')
  })
})

describe('queryAuditLog', () => {
  it('按 Realm 隔离查询', async () => {
    const { db } = createMockDb([
      {
        id: 'id-1',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'read',
        target: {},
        payload_hash: 'h1',
        idempotency_key: 'op-1',
        result: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'id-2',
        realm_id: 'other-realm',
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'read',
        target: {},
        payload_hash: 'h2',
        idempotency_key: 'op-2',
        result: {},
        created_at: new Date('2026-01-02T00:00:00Z'),
      },
    ])
    const rows = await queryAuditLog(db, TEST_REALM)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.realm_id).toBe(TEST_REALM)
  })

  it('按 actorType 过滤', async () => {
    const { db } = createMockDb([
      {
        id: 'id-1',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'read',
        target: {},
        payload_hash: 'h1',
        idempotency_key: 'op-1',
        result: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'id-2',
        realm_id: TEST_REALM,
        actor_type: 'human',
        actor_id: TEST_HUMAN,
        action: 'read',
        target: {},
        payload_hash: 'h2',
        idempotency_key: 'op-2',
        result: {},
        created_at: new Date('2026-01-02T00:00:00Z'),
      },
    ])
    const entityRows = await queryAuditLog(db, TEST_REALM, {
      actorType: 'entity',
    })
    expect(entityRows).toHaveLength(1)
    expect(entityRows[0]!.actor_type).toBe('entity')
  })

  it('limit 限制返回数量', async () => {
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < 5; i++) {
      rows.push({
        id: `id-${i}`,
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'read',
        target: {},
        payload_hash: `h${i}`,
        idempotency_key: `op-${i}`,
        result: {},
        created_at: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      })
    }
    const { db } = createMockDb(rows)
    const limited = await queryAuditLog(db, TEST_REALM, { limit: 2 })
    expect(limited).toHaveLength(2)
  })
})

describe('queryEntityAuditLog', () => {
  it('按 entityId 过滤 Entity 审计', async () => {
    const { db } = createMockDb([
      {
        id: 'id-1',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'write',
        target: {},
        payload_hash: 'h1',
        idempotency_key: 'op-1',
        result: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'id-2',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: 'other-entity',
        action: 'write',
        target: {},
        payload_hash: 'h2',
        idempotency_key: 'op-2',
        result: {},
        created_at: new Date('2026-01-02T00:00:00Z'),
      },
    ])
    const rows = await queryEntityAuditLog(db, TEST_REALM, TEST_ENTITY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actor_id).toBe(TEST_ENTITY)
  })
})

describe('hasEntityActionBeenRecorded', () => {
  it('已记录的 idempotency_key 返回 true', async () => {
    const { db } = createMockDb([
      {
        id: 'id-1',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: TEST_ENTITY,
        action: 'write',
        target: {},
        payload_hash: 'h1',
        idempotency_key: 'op-0001',
        result: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ])
    const exists = await hasEntityActionBeenRecorded(
      db,
      TEST_REALM,
      TEST_ENTITY,
      'op-0001',
    )
    expect(exists).toBe(true)
  })

  it('未记录的 idempotency_key 返回 false', async () => {
    const { db } = createMockDb([])
    const exists = await hasEntityActionBeenRecorded(
      db,
      TEST_REALM,
      TEST_ENTITY,
      'op-9999',
    )
    expect(exists).toBe(false)
  })

  it('其他 Entity 的 idempotency_key 不匹配', async () => {
    const { db } = createMockDb([
      {
        id: 'id-1',
        realm_id: TEST_REALM,
        actor_type: 'entity',
        actor_id: 'other-entity',
        action: 'write',
        target: {},
        payload_hash: 'h1',
        idempotency_key: 'op-0001',
        result: {},
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ])
    const exists = await hasEntityActionBeenRecorded(
      db,
      TEST_REALM,
      TEST_ENTITY,
      'op-0001',
    )
    expect(exists).toBe(false)
  })
})

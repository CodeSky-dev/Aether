// @aether/entity-core · Entity Identity 单元测试
// 用 drizzle-orm/pg-proxy mock 验证 registerEntity/getEntity/listEntities/updateEntity/suspendEntity
// 的 SQL 构造、Realm 隔离守卫与 entities/members 表联动。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import {
  declareCapabilityManifesto,
  toStoredManifesto,
} from '../src/manifesto.js'
import {
  getEntitiesByAuthIdentity,
  getEntity,
  listEntities,
  parseEntityManifesto,
  registerEntity,
  suspendEntity,
  updateEntity,
  type EntityRecord,
} from '../src/identity.js'

const ENTITY_COLUMN_ORDER = [
  'id',
  'realm_id',
  'auth_identity_id',
  'display_name',
  'capability_manifesto',
  'status',
  'memory_ref',
  'created_at',
  'updated_at',
] as const

const MEMBER_COLUMN_ORDER = [
  'id',
  'realm_id',
  'project_id',
  'actor_type',
  'actor_id',
  'role',
  'entitlements',
  'status',
  'created_at',
  'updated_at',
] as const

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_AUTH_IDENTITY = 'auth-identity-001'

interface MockStore {
  entities: Record<string, unknown>[]
  members: Record<string, unknown>[]
  nextEntityId: number
  nextMemberId: number
}

function toEntityArrayRow(record: Record<string, unknown>): unknown[] {
  return ENTITY_COLUMN_ORDER.map((key) => record[key])
}

function toMemberArrayRow(record: Record<string, unknown>): unknown[] {
  return MEMBER_COLUMN_ORDER.map((key) => record[key])
}

function createMockDb(initialEntities: Record<string, unknown>[] = []) {
  const store: MockStore = {
    entities: [...initialEntities],
    members: [],
    nextEntityId: 1,
    nextMemberId: 1,
  }

  const callback: RemoteCallback = async (sql, params, _method) => {
    await Promise.resolve()

    // insert into "entities" ... returning *
    if (sql.includes('insert into "entities"')) {
      const newRow: Record<string, unknown> = {
        id: `ent-${store.nextEntityId}`,
        realm_id: params[0],
        auth_identity_id: params[1],
        display_name: params[2],
        capability_manifesto: parseJsonb(params[3]),
        status: params[4] ?? 'idle',
        memory_ref: parseJsonb(params[5] ?? {}),
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.entities.push(newRow)
      store.nextEntityId += 1
      return { rows: [toEntityArrayRow(newRow)] }
    }

    // insert into "members" ... returning *
    if (sql.includes('insert into "members"')) {
      const newRow: Record<string, unknown> = {
        id: `mem-${store.nextMemberId}`,
        realm_id: params[0],
        project_id: params[1],
        actor_type: params[2],
        actor_id: params[3],
        role: params[4],
        entitlements: parseJsonb(params[5] ?? {}),
        status: params[6] ?? 'active',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.members.push(newRow)
      store.nextMemberId += 1
      return { rows: [toMemberArrayRow(newRow)] }
    }

    // select ... from "entities" where ...
    if (sql.includes('from "entities"')) {
      let matching = store.entities

      // Realm 隔离守卫（getEntitiesByAuthIdentity 不带 realm guard，跨 Realm 查询）
      // 用 `"realm_id" = ` 精确匹配 WHERE 条件，避免误匹配 SELECT 列清单中的 "realm_id"
      if (sql.includes('"realm_id" = ')) {
        const realmId = params[0] as string
        matching = matching.filter((r) => r.realm_id === realmId)
      }

      // 按 id 过滤
      if (sql.includes('"id" = ')) {
        const idIdx = findParamIndex(params, ['ent-1', 'ent-2', 'ent-3', 'ent-4'])
        if (idIdx >= 0) {
          matching = matching.filter((r) => r.id === params[idIdx])
        }
      }

      // 按 auth_identity_id 过滤
      if (sql.includes('"auth_identity_id" = ')) {
        const authIdx = findParamIndex(params, [TEST_AUTH_IDENTITY])
        if (authIdx >= 0) {
          matching = matching.filter(
            (r) => r.auth_identity_id === params[authIdx],
          )
        }
      }

      return { rows: matching.map(toEntityArrayRow) }
    }

    // update "entities" set ... where ... returning *
    if (sql.includes('update "entities"')) {
      // drizzle: update "entities" set "col1" = $1, ... where "realm_id" = $N and "id" = $M returning *
      // SET 值在前，WHERE 值（realm_id, id）在后
      const setMatch = sql.match(/set\s+(.*?)\s+where/is)
      const setColumnCount = setMatch
        ? (setMatch[1]!.match(/"\w+"\s*=/g) ?? []).length
        : 0

      const realmParam = params[setColumnCount] as string
      const idParam = params[setColumnCount + 1] as string

      const entity = store.entities.find(
        (r) => r.realm_id === realmParam && r.id === idParam,
      )
      if (!entity) {
        return { rows: [] }
      }

      // 按 SET 子句的列名顺序更新（jsonb 列需反序列化）
      if (setMatch) {
        const setClauses = setMatch[1]!.split(',').map((s) => s.trim())
        let paramIdx = 0
        for (const clause of setClauses) {
          const colMatch = clause.match(/"(\w+)"\s*=/)
          if (colMatch) {
            const col = colMatch[1] as keyof typeof entity
            const isJsonb =
              col === 'capability_manifesto' || col === 'memory_ref'
            entity[col] = isJsonb
              ? parseJsonb(params[paramIdx])
              : params[paramIdx]
            paramIdx += 1
          }
        }
      }
      entity.updated_at = new Date('2026-01-02T00:00:00Z')
      return { rows: [toEntityArrayRow(entity)] }
    }

    // update "members" set ... where ...
    if (sql.includes('update "members"')) {
      // drizzle: update "members" set "status" = $1 where "realm_id" = $2 and "actor_type" = $3 and "actor_id" = $4
      // SET 值在前，WHERE 值在后；按 SET 列数定位 WHERE 参数起点
      const setMatch = sql.match(/set\s+(.*?)\s+where/is)
      const setColumnCount = setMatch
        ? (setMatch[1]!.match(/"\w+"\s*=/g) ?? []).length
        : 0

      const realmParam = params[setColumnCount] as string
      const actorTypeParam = params[setColumnCount + 1] as string
      const actorIdParam = params[setColumnCount + 2] as string
      const statusParam = params[0] as string

      for (const m of store.members) {
        if (
          m.realm_id === realmParam &&
          m.actor_type === actorTypeParam &&
          m.actor_id === actorIdParam
        ) {
          m.status = statusParam
        }
      }
      return { rows: [] }
    }

    return { rows: [] }
  }

  const db = drizzle(callback)
  return { db, store }
}

/**
 * drizzle 的 PgJsonb 列在 mapToDriverValue 阶段会把对象 JSON.stringify 成字符串再传入 callback。
 * mock store 为与真实 db 行为一致（存储对象、读取对象），这里把字符串解析回对象。
 */
function parseJsonb(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function findParamIndex(params: readonly unknown[], values: string[]): number {
  for (let i = 0; i < params.length; i++) {
    if (values.includes(params[i] as string)) {
      return i
    }
  }
  return -1
}

function makeEntityRecord(
  overrides: Partial<EntityRecord> = {},
): Record<string, unknown> {
  return {
    id: 'ent-1',
    realm_id: TEST_REALM,
    auth_identity_id: TEST_AUTH_IDENTITY,
    display_name: 'Code Reviewer',
    capability_manifesto: toStoredManifesto(
      declareCapabilityManifesto({
        capabilities: ['code-review'],
        permission_scopes: ['thread:read'],
        available_tools: ['search'],
      }),
    ),
    status: 'active',
    memory_ref: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('registerEntity', () => {
  it('在 entities 表创建档案 + members 表加入 Realm', async () => {
    const { db, store } = createMockDb()
    const manifesto = declareCapabilityManifesto({
      capabilities: ['code-review'],
      permission_scopes: ['thread:read', 'thread:create'],
      available_tools: ['search'],
    })
    const entity = await registerEntity(db, {
      realmId: TEST_REALM,
      authIdentityId: TEST_AUTH_IDENTITY,
      displayName: 'Code Reviewer',
      manifesto,
    })
    expect(entity.display_name).toBe('Code Reviewer')
    expect(entity.status).toBe('idle')
    expect(entity.realm_id).toBe(TEST_REALM)
    expect(store.entities).toHaveLength(1)
    expect(store.members).toHaveLength(1)
    expect(store.members[0]!.actor_type).toBe('entity')
    expect(store.members[0]!.actor_id).toBe(entity.id)
    expect(store.members[0]!.role).toBe('member')
  })

  it('可自定义 role 和 memoryRef', async () => {
    const { db, store } = createMockDb()
    await registerEntity(db, {
      realmId: TEST_REALM,
      authIdentityId: TEST_AUTH_IDENTITY,
      displayName: 'Admin Entity',
      manifesto: declareCapabilityManifesto(),
      role: 'admin',
      memoryRef: { lastTask: 'task-1' },
    })
    expect(store.members[0]!.role).toBe('admin')
    expect(store.entities[0]!.memory_ref).toEqual({ lastTask: 'task-1' })
  })
})

describe('getEntity', () => {
  it('按 id + Realm 查询档案', async () => {
    const { db } = createMockDb([makeEntityRecord()])
    const entity = await getEntity(db, TEST_REALM, 'ent-1')
    expect(entity).not.toBeNull()
    expect(entity!.id).toBe('ent-1')
    expect(entity!.display_name).toBe('Code Reviewer')
  })

  it('Realm 不匹配时返回 null', async () => {
    const { db } = createMockDb([makeEntityRecord()])
    const entity = await getEntity(db, 'other-realm', 'ent-1')
    expect(entity).toBeNull()
  })

  it('id 不存在时返回 null', async () => {
    const { db } = createMockDb([])
    const entity = await getEntity(db, TEST_REALM, 'ent-nonexistent')
    expect(entity).toBeNull()
  })
})

describe('getEntitiesByAuthIdentity', () => {
  it('跨 Realm 按 auth_identity_id 查询', async () => {
    const { db } = createMockDb([
      makeEntityRecord({ id: 'ent-1', realm_id: TEST_REALM }),
      makeEntityRecord({
        id: 'ent-2',
        realm_id: 'other-realm',
        auth_identity_id: TEST_AUTH_IDENTITY,
      }),
    ])
    const entities = await getEntitiesByAuthIdentity(db, TEST_AUTH_IDENTITY)
    expect(entities).toHaveLength(2)
    expect(entities.map((e) => e.id)).toContain('ent-1')
    expect(entities.map((e) => e.id)).toContain('ent-2')
  })
})

describe('listEntities', () => {
  it('列出 Realm 内所有 Entity', async () => {
    const { db } = createMockDb([
      makeEntityRecord({ id: 'ent-1', realm_id: TEST_REALM }),
      makeEntityRecord({
        id: 'ent-2',
        realm_id: TEST_REALM,
        display_name: 'Summary Writer',
      }),
      makeEntityRecord({
        id: 'ent-3',
        realm_id: 'other-realm',
      }),
    ])
    const entities = await listEntities(db, TEST_REALM)
    expect(entities).toHaveLength(2)
    expect(entities.every((e) => e.realm_id === TEST_REALM)).toBe(true)
  })
})

describe('updateEntity', () => {
  it('更新 displayName', async () => {
    const { db, store } = createMockDb([makeEntityRecord()])
    const updated = await updateEntity(db, TEST_REALM, 'ent-1', {
      displayName: 'Renamed Entity',
    })
    expect(updated).not.toBeNull()
    expect(updated!.display_name).toBe('Renamed Entity')
    expect(store.entities[0]!.display_name).toBe('Renamed Entity')
  })

  it('更新 status', async () => {
    const { db } = createMockDb([makeEntityRecord({ status: 'active' })])
    const updated = await updateEntity(db, TEST_REALM, 'ent-1', {
      status: 'suspended',
    })
    expect(updated!.status).toBe('suspended')
  })

  it('更新 manifesto', async () => {
    const { db } = createMockDb([makeEntityRecord()])
    const newManifesto = declareCapabilityManifesto({
      capabilities: ['new-capability'],
    })
    const updated = await updateEntity(db, TEST_REALM, 'ent-1', {
      manifesto: newManifesto,
    })
    expect(updated).not.toBeNull()
    // manifesto 落库为 jsonb，校验后应包含新能力
    const parsed = parseEntityManifesto(updated!)
    expect(parsed.capabilities).toEqual(['new-capability'])
  })

  it('不提供任何字段时直接返回当前档案', async () => {
    const { db } = createMockDb([makeEntityRecord()])
    const entity = await updateEntity(db, TEST_REALM, 'ent-1', {})
    expect(entity!.display_name).toBe('Code Reviewer')
  })
})

describe('suspendEntity', () => {
  it('标记 entities.status=suspended + members.status=suspended', async () => {
    const { db, store } = createMockDb([makeEntityRecord()])
    // 先注册一个 member
    store.members.push({
      id: 'mem-1',
      realm_id: TEST_REALM,
      project_id: null,
      actor_type: 'entity',
      actor_id: 'ent-1',
      role: 'member',
      entitlements: {},
      status: 'active',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    })
    const entity = await suspendEntity(db, TEST_REALM, 'ent-1')
    expect(entity).not.toBeNull()
    expect(entity!.status).toBe('suspended')
    expect(store.entities[0]!.status).toBe('suspended')
    expect(store.members[0]!.status).toBe('suspended')
  })

  it('Entity 不存在时返回 null', async () => {
    const { db } = createMockDb([])
    const entity = await suspendEntity(db, TEST_REALM, 'ent-nonexistent')
    expect(entity).toBeNull()
  })
})

describe('parseEntityManifesto', () => {
  it('从 db 记录解析强类型 manifesto', () => {
    const record = makeEntityRecord() as unknown as EntityRecord
    const manifesto = parseEntityManifesto(record)
    expect(manifesto.capabilities).toEqual(['code-review'])
    expect(manifesto.permission_scopes).toEqual(['thread:read'])
    expect(manifesto.available_tools).toEqual(['search'])
  })

  it('manifesto 无效时返回空 manifesto（不崩溃）', () => {
    const record = makeEntityRecord({
      capability_manifesto: { invalid: true },
    }) as unknown as EntityRecord
    const manifesto = parseEntityManifesto(record)
    expect(manifesto.capabilities).toEqual([])
    expect(manifesto.permission_scopes).toEqual([])
  })
})

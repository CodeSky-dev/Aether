// @aether/db · CRDT 更新日志查询层单元测试
// 使用 drizzle-orm/pg-proxy 捕获 SQL，无需真实数据库即可验证
// 幂等去重、Realm 隔离守卫、游标重放与游标读取的查询构造。
// pg-proxy 的行按列序数组返回（mapResultRow 以 row[columnIndex] 取列），
// 因此 mock 行使用 CRDT_COLUMN_ORDER 对齐 crdt_updates 的列顺序。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import {
  appendCrdtUpdate,
  readCrdtUpdateCursor,
  readCrdtUpdatesSince,
} from '../src/update-log.js'

const CRDT_COLUMN_ORDER = [
  'id',
  'realm_id',
  'doc_ref',
  'seq',
  'payload',
  'actor_type',
  'actor_id',
  'idempotency_key',
  'created_at',
] as const

interface CapturedQuery {
  sql: string
  params: unknown[]
  method: 'all' | 'execute'
}

function createProxyDb(options: {
  onQuery?: (query: CapturedQuery) => unknown[][] | undefined
} = {}) {
  const queries: CapturedQuery[] = []
  const callback: RemoteCallback = async (sql, params, method) => {
    const query = { sql, params, method }
    queries.push(query)
    const rows = options.onQuery?.(query)
    await Promise.resolve()
    return { rows: rows ?? [] }
  }
  const db = drizzle(callback)
  return { db, queries }
}

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_DOC = 'doc:realm-a:current-1'

const sampleInput = {
  docRef: TEST_DOC,
  actorType: 'human' as const,
  actorId: '4e0f9c1a-0000-0000-0000-000000000001',
  payload: new Uint8Array([1, 2, 3, 4]),
  idempotencyKey: 'op-0001',
}

/** 把 crdt_updates 记录对象对齐到列序数组 */
function toArrayRow(record: Record<string, unknown>): unknown[] {
  return CRDT_COLUMN_ORDER.map((key) => record[key])
}

const insertedRecord = {
  id: 'a0000000-0000-0000-0000-0000000000aa',
  realm_id: TEST_REALM,
  doc_ref: TEST_DOC,
  seq: 7,
  payload: sampleInput.payload,
  actor_type: 'human',
  actor_id: sampleInput.actorId,
  idempotency_key: 'op-0001',
  created_at: new Date('2026-01-01T00:00:00Z'),
}

describe('appendCrdtUpdate', () => {
  it('生成带幂等去重与 Realm 字段的插入 SQL', async () => {
    const { db, queries } = createProxyDb({ onQuery: () => [] })
    await appendCrdtUpdate(db, TEST_REALM, sampleInput)

    expect(queries).toHaveLength(1)
    const { sql, params } = queries[0]!
    expect(sql).toContain('insert into "crdt_updates"')
    expect(sql).toContain('on conflict ("doc_ref","idempotency_key") do nothing')
    expect(sql).toContain('returning')
    expect(params).toContain(TEST_REALM)
    expect(params).toContain(TEST_DOC)
    expect(params).toContain('op-0001')
    expect(
      params.some(
        (p) => Buffer.isBuffer(p) && p.equals(Buffer.from(sampleInput.payload)),
      ),
    ).toBe(true)
  })

  it('命中幂等唯一约束时静默返回 null', async () => {
    const { db } = createProxyDb({ onQuery: () => [] })
    const record = await appendCrdtUpdate(db, TEST_REALM, sampleInput)
    expect(record).toBeNull()
  })

  it('写入成功时返回携带服务端 seq 的记录', async () => {
    const { db } = createProxyDb({ onQuery: () => [toArrayRow(insertedRecord)] })
    const record = await appendCrdtUpdate(db, TEST_REALM, sampleInput)

    expect(record).not.toBeNull()
    expect(record?.seq).toBe(7)
    expect(record?.doc_ref).toBe(TEST_DOC)
    expect(record?.realm_id).toBe(TEST_REALM)
  })
})

describe('readCrdtUpdatesSince', () => {
  it('生成带 Realm 守卫、doc 过滤与 seq 游标的升序查询', async () => {
    const { db, queries } = createProxyDb()
    await readCrdtUpdatesSince(db, TEST_REALM, TEST_DOC, { afterSeq: 3 })

    expect(queries).toHaveLength(1)
    const { sql } = queries[0]!
    expect(sql).toContain('from "crdt_updates"')
    expect(sql).toContain('"crdt_updates"."realm_id" =')
    expect(sql).toContain('"crdt_updates"."doc_ref" =')
    expect(sql).toContain('"crdt_updates"."seq" >')
    expect(sql).toContain('order by "crdt_updates"."seq" asc')
    expect(sql).not.toContain('limit')
  })

  it('指定 limit 时生成分页上限', async () => {
    const { db, queries } = createProxyDb()
    await readCrdtUpdatesSince(db, TEST_REALM, TEST_DOC, { limit: 50 })

    expect(queries[0]!.sql).toContain('limit')
  })

  it('按升序返回重放记录', async () => {
    const rows = [
      toArrayRow({ ...insertedRecord, seq: 4, idempotency_key: 'op-4' }),
      toArrayRow({ ...insertedRecord, seq: 5, idempotency_key: 'op-5' }),
    ]
    const { db } = createProxyDb({ onQuery: () => rows })
    const result = await readCrdtUpdatesSince(db, TEST_REALM, TEST_DOC)

    expect(result.map((r) => r.seq)).toEqual([4, 5])
  })
})

describe('readCrdtUpdateCursor', () => {
  it('生成 max(seq) 聚合查询并附加 Realm 守卫', async () => {
    const { db, queries } = createProxyDb({ onQuery: () => [[42]] })
    const cursor = await readCrdtUpdateCursor(db, TEST_REALM, TEST_DOC)

    expect(cursor).toBe(42)
    expect(queries[0]!.sql).toContain('max("seq")')
    expect(queries[0]!.sql).toContain('"crdt_updates"."realm_id" =')
  })

  it('无任何增量时返回 null', async () => {
    const { db } = createProxyDb({ onQuery: () => [] })
    const cursor = await readCrdtUpdateCursor(db, TEST_REALM, TEST_DOC)
    expect(cursor).toBeNull()
  })
})

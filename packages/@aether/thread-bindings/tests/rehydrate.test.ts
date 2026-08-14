// @aether/thread-bindings · Rehydration Path 单元测试
// 验证 thread 打开时重建完整上下文（锚点、Entity、对话、Manifestation）。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import { rehydrateThread } from '../src/rehydrate.js'

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_THREAD_ID = 'thread-1'
const TEST_DIALOGUE_ID = 'dlg-001'

interface MockMsg {
  id: string; realm_id: string; dialogue_id: string; seq: number;
  actor_type: string; actor_id: string; role: string; content: string;
  metadata: unknown; created_at: Date;
}
interface MockThread {
  id: string; realm_id: string; project_id: string; title: string; status: string;
  code_anchor: Record<string, unknown>; manifestation_url: string | null;
  dialogue_ref: string | null; resolution_contract: Record<string, unknown> | null;
  parent_thread_id: string | null; created_at: Date; updated_at: Date;
}
interface MockStore { threads: MockThread[]; dialogueMessages: MockMsg[] }

function makeThreadRow(r: MockThread): unknown[] {
  return [r.id, r.realm_id, r.project_id, r.title, r.status, r.code_anchor, r.manifestation_url, r.dialogue_ref, r.resolution_contract, r.parent_thread_id, r.created_at, r.updated_at]
}
function makeMsgRow(r: MockMsg): unknown[] {
  return [r.id, r.realm_id, r.dialogue_id, r.seq, r.actor_type, r.actor_id, r.role, r.content, r.metadata, r.created_at]
}

function createMockDb(initialThreads: MockThread[] = [], initialMessages: MockMsg[] = []) {
  const store: MockStore = { threads: [...initialThreads], dialogueMessages: [...initialMessages] }

  const callback: RemoteCallback = async (sql, params) => {
    await Promise.resolve()

    const idx = (table: string, col: string): number => {
      const re = new RegExp(`"${table}"\\.\\s*"${col}"\\s*=\\s*(\\$\\d+)`)
      const m = sql.match(re)
      return m ? parseInt(m[1]!.slice(1), 10) - 1 : -1
    }

    // rehydrate.ts uses and(eq(threads.id, threadId), eq(threads.realm_id, realmId))
    // → params order: [threadId, realmId] (id first because it was written first in code)
    // But we need to check actual SQL to determine order.
    // We can detect: if SQL contains both id and realm_id as eq() and NOT inside realmScope
    // In drizzle, realmScope wraps in a subquery, so:
    //   - getThread:  SELECT ... FROM threads WHERE "threads"."id" = $1  (params[0]=threadId)
    //   - rehydrate: SELECT ... FROM threads WHERE ("threads"."id" = $1 and "threads"."realm_id" = $2)
    // Actually both use params[0] as the first condition, so:
    //   getThread uses:   eq(id)     → SQL: WHERE "threads"."id" = $1              → params[0]=threadId
    //   rehydrate uses:  and(eq(id), eq(realm)) → SQL: WHERE ("threads"."id" = $1 and "threads"."realm_id" = $2)
    //   Wait, let me check the realmScope behavior...
    //
    // Actually from the source code:
    //   getThread:   .where(realmScope(threads, realmId, eq(threads.id, threadId)))
    //   rehydrate:   .where(and(eq(threads.id, threadId), eq(threads.realm_id, realmId)))
    //
    // The key difference:
    //   - realmScope wraps the query, params[0] is ALWAYS realm_id
    //   - non-realmScope: params[0] is the first eq() arg
    //
    //   So getThread: params[0] = realmId, params[1] = threadId  (realmScope adds realmId first)
    //   rehydrate:   params[0] = threadId, params[1] = realmId

    if (sql.includes('from "threads"')) {
      let rows = [...store.threads]
      const idIdx = idx('threads', 'id')
      const realmIdx = idx('threads', 'realm_id')

      // rehydrate path: both conditions present, non-realmScope
      if (idIdx >= 0 && realmIdx >= 0) {
        const idVal = params[idIdx] as string
        const realmVal = params[realmIdx] as string
        rows = rows.filter((r) => r.id === idVal && r.realm_id === realmVal)
      } else if (idIdx >= 0) {
        // getThread/realmScope path: params[0] = realmId
        const realmParam = params[0] as string
        rows = rows.filter((r) => r.realm_id === realmParam && r.id === params[idIdx])
      } else {
        // listThreads without id filter
        const realmParam = params[0] as string
        rows = rows.filter((r) => r.realm_id === realmParam)
      }
      return { rows: rows.map(makeThreadRow) }
    }

    if (sql.includes('from "dialogue_messages"')) {
      let rows = [...store.dialogueMessages]
      const didx = idx('dialogue_messages', 'dialogue_id')
      const ridx = idx('dialogue_messages', 'realm_id')
      // realmScope: params[0]=realmId, params[1]=dialogueId
      if (ridx >= 0 && didx >= 0) {
        // Both detected — realmScope wraps realm first
        const realmParam = params[ridx] as string
        const didVal = params[didx] as string
        rows = rows.filter((r) => r.realm_id === realmParam && r.dialogue_id === didVal)
      } else {
        const realmParam = params[0] as string
        rows = rows.filter((r) => r.realm_id === realmParam)
        if (didx >= 0) rows = rows.filter((r) => r.dialogue_id === params[didx])
      }
      if (sql.includes('limit')) {
        const limit = params[params.length - 1] as number
        rows = rows.slice(rows.length - limit)
      }
      return { rows: rows.map(makeMsgRow) }
    }

    return { rows: [] }
  }

  return { db: drizzle(callback), store }
}

function makeThreadRecord(overrides: Partial<MockThread> = {}): MockThread {
  return {
    id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: 'proj-1',
    title: 'Test Thread', status: 'open',
    code_anchor: { file: 'src/auth.ts', range: { start: 10, end: 50 } },
    manifestation_url: null, dialogue_ref: TEST_DIALOGUE_ID,
    resolution_contract: null, parent_thread_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('rehydrateThread', () => {
  it('空上下文：Thread 不存在', async () => {
    const { db } = createMockDb([])
    const ctx = await rehydrateThread(db as never, db as never, TEST_REALM, 'missing-thread')
    expect(ctx.thread.id).toBe('missing-thread')
    expect(ctx.gapReasons).toContain('thread_not_found')
    expect(ctx.codeAnchor).toEqual({ file: '' })
    expect(ctx.entities).toEqual([])
    expect(ctx.dialogueMessages).toEqual([])
  })

  it('正常重建包含 codeAnchor + dialogueMessages', async () => {
    const { db } = createMockDb([makeThreadRecord()], [
      { id: 'msg-1', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 1, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'Q', metadata: {}, created_at: new Date() },
      { id: 'msg-2', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 2, actor_type: 'entity', actor_id: 'e1', role: 'assistant', content: 'A', metadata: {}, created_at: new Date() },
    ])
    const ctx = await rehydrateThread(db as never, db as never, TEST_REALM, TEST_THREAD_ID)
    expect(ctx.thread.id).toBe(TEST_THREAD_ID)
    expect(ctx.gapReasons).toBeUndefined()
    expect(ctx.codeAnchor.file).toBe('src/auth.ts')
    expect(ctx.entities).toHaveLength(1)
    expect(ctx.dialogueMessages).toHaveLength(2)
  })

  it('对话消息按 seq 升序返回', async () => {
    const { db } = createMockDb([makeThreadRecord()], [
      { id: 'msg-1', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 1, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'Q', metadata: {}, created_at: new Date() },
      { id: 'msg-2', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 2, actor_type: 'entity', actor_id: 'e1', role: 'assistant', content: 'A', metadata: {}, created_at: new Date() },
      { id: 'msg-3', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 3, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'Q2', metadata: {}, created_at: new Date() },
    ])
    const ctx = await rehydrateThread(db as never, db as never, TEST_REALM, TEST_THREAD_ID)
    expect(ctx.dialogueMessages.map((m) => m.seq)).toEqual([1, 2, 3])
  })

  it('dialogueLimit 限制返回的消息数', async () => {
    const { db } = createMockDb([makeThreadRecord()], [
      { id: 'msg-1', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 1, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'm0', metadata: {}, created_at: new Date() },
      { id: 'msg-2', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 2, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'm1', metadata: {}, created_at: new Date() },
      { id: 'msg-3', realm_id: TEST_REALM, dialogue_id: TEST_DIALOGUE_ID, seq: 3, actor_type: 'human', actor_id: 'u1', role: 'user', content: 'm2', metadata: {}, created_at: new Date() },
    ])
    const ctx = await rehydrateThread(db as never, db as never, TEST_REALM, TEST_THREAD_ID, { dialogueLimit: 2 })
    expect(ctx.dialogueMessages).toHaveLength(2)
    expect(ctx.dialogueMessages[0]!.seq).toBe(2)
    expect(ctx.dialogueMessages[1]!.seq).toBe(3)
  })

  it('Thread 存在但无 dialogue_ref 时 entities 为空', async () => {
    const { db } = createMockDb([makeThreadRecord({ dialogue_ref: null })], [])
    const ctx = await rehydrateThread(db as never, db as never, TEST_REALM, TEST_THREAD_ID)
    expect(ctx.thread.id).toBe(TEST_THREAD_ID)
    expect(ctx.entities).toHaveLength(0)
    expect(ctx.dialogueMessages).toHaveLength(0)
  })
})

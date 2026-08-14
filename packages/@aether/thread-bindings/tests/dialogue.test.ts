// @aether/thread-bindings · Dialogue Forging 单元测试
// 验证对话消息 CRUD 与 Thread 绑定的 SQL 构造。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import {
  appendDialogueToThread,
  clearDialogue,
  createDialogueMessage,
  getDialogueMessages,
  removeDialogueFromThread,
} from '../src/dialogue.js'

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_DIALOGUE_ID = 'dlg-001'
const TEST_THREAD_ID = 'thread-1'

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
interface MockStore { threads: MockThread[]; dialogueMessages: MockMsg[]; nextMsgId: number }

function makeMsgRow(r: MockMsg): unknown[] {
  return [r.id, r.realm_id, r.dialogue_id, r.seq, r.actor_type, r.actor_id, r.role, r.content, r.metadata, r.created_at]
}
function makeThreadRow(r: MockThread): unknown[] {
  return [r.id, r.realm_id, r.project_id, r.title, r.status, r.code_anchor, r.manifestation_url, r.dialogue_ref, r.resolution_contract, r.parent_thread_id, r.created_at, r.updated_at]
}

function createMockDb(initialThreads: MockThread[] = [], initialMessages: MockMsg[] = []) {
  const store: MockStore = { threads: [...initialThreads], dialogueMessages: [...initialMessages], nextMsgId: 1 }

  const callback: RemoteCallback = async (sql, params) => {
    await Promise.resolve()

    const idx = (table: string, col: string): number => {
      const re = new RegExp(`"${table}"\\.\\s*"${col}"\\s*=\\s*(\\$\\d+)`)
      const m = sql.match(re)
      return m ? parseInt(m[1]!.slice(1), 10) - 1 : -1
    }

    if (sql.includes('insert into "dialogue_messages"')) {
      const newRow: MockMsg = {
        id: `msg-${store.nextMsgId++}`,
        realm_id: params[1] as string,
        dialogue_id: params[2] as string,
        seq: params[3] as number,
        actor_type: params[4] as string,
        actor_id: params[5] as string,
        role: params[6] as string,
        content: params[7] as string,
        metadata: params[8],
        created_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.dialogueMessages.push(newRow)
      return { rows: [makeMsgRow(newRow)] }
    }

    if (sql.includes('delete from "dialogue_messages"')) {
      const realmParam = params[0] as string
      const didx = idx('dialogue_messages', 'dialogue_id')
      const dialogueId = didx >= 0 ? params[didx] as string : null
      if (dialogueId !== null) {
        const before = store.dialogueMessages.length
        store.dialogueMessages = store.dialogueMessages.filter((r) => !(r.realm_id === realmParam && r.dialogue_id === dialogueId))
        const deleted = before - store.dialogueMessages.length
        const deletedRows: MockMsg[] = []
        for (let i = 0; i < deleted; i++) {
          deletedRows.push({} as MockMsg)
        }
        return { rows: deletedRows.map(makeMsgRow) }
      }
      return { rows: [] }
    }

    if (sql.includes('update "threads"')) {
      const setMatch = sql.match(/set\s+(.*?)\s+where/is)
      const idIndex = idx('threads', 'id')
      const realmIndex = idx('threads', 'realm_id')
      const threadIdParam = idIndex >= 0 ? params[idIndex] as string : params[0] as string
      const realmParam = realmIndex >= 0 ? params[realmIndex] as string : params[1] as string
      const target = store.threads.find((r) => r.realm_id === realmParam && r.id === threadIdParam)
      if (!target) return { rows: [] }
      if (setMatch) {
        const setClause = setMatch[1]!
        const colMatches = [...setClause.matchAll(/"(\w+)"\s*=\s*\$\d+/g)]
        for (const colMatch of colMatches) {
          const colName = colMatch[1] as keyof MockThread
          const placeholder = colMatch[0]!.match(/\$(\d+)/)
          const paramIdx = placeholder ? parseInt(placeholder[1]!, 10) - 1 : -1
          if (paramIdx >= 0) {
            (target as any)[colName] = params[paramIdx]
          }
        }
      }
      target.updated_at = new Date('2026-01-02T00:00:00Z')
      return { rows: [makeThreadRow(target)] }
    }

    if (sql.includes('insert into "threads"')) {
      const newRow: MockThread = {
        id: 'thread-1', realm_id: params[1] as string,
        project_id: params[2] as string, title: params[3] as string,
        status: (params[4] as string) ?? 'open',
        code_anchor: params[5], manifestation_url: params[6],
        dialogue_ref: params[7], resolution_contract: params[8],
        parent_thread_id: params[9],
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.threads.push(newRow)
      return { rows: [makeThreadRow(newRow)] }
    }

    if (sql.includes('from "dialogue_messages"')) {
      let rows = [...store.dialogueMessages]
      const realmParam = params[0] as string
      rows = rows.filter((r) => r.realm_id === realmParam)
      const didx = idx('dialogue_messages', 'dialogue_id')
      if (didx >= 0) rows = rows.filter((r) => r.dialogue_id === params[didx])
      if (sql.includes('limit')) {
        const limit = params[params.length - 1] as number
        rows = rows.slice(rows.length - limit)
      }
      return { rows: rows.map(makeMsgRow) }
    }

    if (sql.includes('from "threads"')) {
      let rows = [...store.threads]
      const realmParam = params[0] as string
      rows = rows.filter((r) => r.realm_id === realmParam)
      const idIdx = idx('threads', 'id')
      if (idIdx >= 0) rows = rows.filter((r) => r.id === params[idIdx])
      return { rows: rows.map(makeThreadRow) }
    }

    return { rows: [] }
  }

  return { db: drizzle(callback), store }
}

describe('createDialogueMessage', () => {
  it('创建用户消息并设置 seq=1', async () => {
    const { db, store } = createMockDb()
    const msg = await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID,
      actorType: 'human', actorId: 'user-1', role: 'user', content: 'Hello',
    })
    expect(msg.id).toBeDefined()
    expect(msg.seq).toBe(1)
    expect(msg.role).toBe('user')
    expect(store.dialogueMessages).toHaveLength(1)
  })

  it('后续消息 seq 递增', async () => {
    const { db } = createMockDb()
    await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'human', actorId: 'u1', role: 'user', content: 'A'
    })
    const m2 = await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'entity', actorId: 'e1', role: 'assistant', content: 'B'
    })
    expect(m2.seq).toBe(2)
  })
})

describe('getDialogueMessages', () => {
  it('按 dialogueId 查询所有消息', async () => {
    const { db } = createMockDb()
    await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'human', actorId: 'u1', role: 'user', content: 'Q'
    })
    await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'entity', actorId: 'e1', role: 'assistant', content: 'A'
    })
    const messages = await getDialogueMessages(db, TEST_REALM, TEST_DIALOGUE_ID)
    expect(messages).toHaveLength(2)
    expect(messages[0]!.seq).toBe(1)
    expect(messages[1]!.seq).toBe(2)
  })

  it('按 limit 限制返回数量', async () => {
    const { db } = createMockDb()
    for (let i = 0; i < 5; i++) {
      await createDialogueMessage(db, TEST_REALM, {
        realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'human', actorId: 'u1', role: 'user', content: `m${i}`
      })
    }
    const recent = await getDialogueMessages(db, TEST_REALM, TEST_DIALOGUE_ID, { limit: 2 })
    expect(recent).toHaveLength(2)
    expect(recent[0]!.seq).toBe(recent[1]!.seq - 1)
  })
})

describe('appendDialogueToThread', () => {
  it('将 dialogue_ref 绑定到 Thread', async () => {
    const { db, store } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: 'proj-1',
      title: 'T', status: 'open', code_anchor: {},
      manifestation_url: null, dialogue_ref: null, resolution_contract: null,
      parent_thread_id: null, created_at: new Date(), updated_at: new Date(),
    }])
    const updated = await appendDialogueToThread(db, TEST_REALM, TEST_THREAD_ID, TEST_DIALOGUE_ID)
    expect(updated).toBeUndefined()
    expect(store.threads[0]!.dialogue_ref).toBe(TEST_DIALOGUE_ID)
  })

  it('Thread 不存在时抛出错误', async () => {
    const { db } = createMockDb()
    await expect(appendDialogueToThread(db, TEST_REALM, 'missing', TEST_DIALOGUE_ID))
      .rejects.toThrow('Thread missing not found')
  })
})

describe('removeDialogueFromThread', () => {
  it('清除 Thread 上的 dialogue_ref', async () => {
    const { db, store } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: 'proj-1',
      title: 'T', status: 'open', code_anchor: {},
      manifestation_url: null, dialogue_ref: TEST_DIALOGUE_ID, resolution_contract: null,
      parent_thread_id: null, created_at: new Date(), updated_at: new Date(),
    }])
    const updated = await removeDialogueFromThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(updated).toBeUndefined()
    expect(store.threads[0]!.dialogue_ref).toBeNull()
  })
})

describe('clearDialogue', () => {
  it('删除指定 dialogue 的所有消息', async () => {
    const { db, store } = createMockDb()
    await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'human', actorId: 'u1', role: 'user', content: 'X'
    })
    await createDialogueMessage(db, TEST_REALM, {
      realmId: TEST_REALM, dialogueId: TEST_DIALOGUE_ID, actorType: 'entity', actorId: 'e1', role: 'assistant', content: 'Y'
    })
    const cleared = await clearDialogue(db, TEST_REALM, TEST_DIALOGUE_ID)
    expect(cleared).toBe(2)
    expect(store.dialogueMessages).toHaveLength(0)
  })
})

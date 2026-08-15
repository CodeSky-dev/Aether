// @aether/thread-bindings · Code Anchor Binding 单元测试
// 验证 Thread CRUD 和锚点漂移迁移。
import { describe, it, expect } from 'vitest'
import { drizzle, type RemoteCallback } from 'drizzle-orm/pg-proxy'
import { createThread, getThread, updateThread, deleteThread, listThreads, driftAnchor } from '../src/anchor.js'

const TEST_REALM = '550e8400-e29b-41d4-a716-446655440000'
const TEST_PROJECT_ID = 'proj-alpha'
const TEST_THREAD_ID = 'thread-1'

interface MockThread {
  id: string; realm_id: string; project_id: string; title: string; status: string;
  code_anchor: Record<string, unknown>; manifestation_url: string | null;
  dialogue_ref: string | null; resolution_contract: Record<string, unknown> | null;
  parent_thread_id: string | null;
  created_at: Date; updated_at: Date;
}

interface MockStore { threads: MockThread[] }

function makeThreadRow(r: MockThread): unknown[] {
  return [
    r.id, r.realm_id, r.project_id, r.title, r.status, r.code_anchor,
    r.manifestation_url, r.dialogue_ref, r.resolution_contract, r.parent_thread_id,
    r.created_at, r.updated_at,
  ]
}

function createMockDb(initialThreads: MockThread[] = []) {
  const store: MockStore = { threads: [...initialThreads] }

  const callback: RemoteCallback = async (sql, params) => {
    await Promise.resolve()

    const idx = (table: string, col: string): number => {
      const re = new RegExp(`"${table}"\\.\\s*"${col}"\\s*=\\s*(\\$\\d+)`)
      const m = sql.match(re)
      return m ? parseInt(m[1]!.slice(1), 10) - 1 : -1
    }

    if (sql.includes('insert into "threads"')) {
      const newRow: MockThread = {
        id: params[0] as string,
        realm_id: params[1] as string,
        project_id: params[2] as string,
        title: params[3] as string,
        status: params[4] as string,
        code_anchor: params[5] as Record<string, unknown>,
        manifestation_url: params[6] as string | null,
        dialogue_ref: params[7] as string | null,
        resolution_contract: params[8] as Record<string, unknown> | null,
        parent_thread_id: params[9] as string | null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      }
      store.threads.push(newRow)
      return { rows: [makeThreadRow(newRow)] }
    }

    if (sql.includes('delete from "threads"')) {
      const idIndex = idx('threads', 'id')
      const realmIndex = idx('threads', 'realm_id')
      const idParam = idIndex >= 0 ? params[idIndex] as string : null
      const realmParam = realmIndex >= 0 ? params[realmIndex] as string : params[0] as string
      const idx2 = store.threads.findIndex((r) => r.realm_id === realmParam && (idParam === null || r.id === idParam))
      if (idx2 === -1) return { rows: [] }
      const [removed] = store.threads.splice(idx2, 1)
      return { rows: removed ? [makeThreadRow(removed)] : [] }
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
          const placeholder = colMatch[0].match(/\$(\d+)/)
          const paramIdx = placeholder ? parseInt(placeholder[1]!, 10) - 1 : -1
          if (paramIdx >= 0) {
            (target as Record<string, unknown>)[colName] = params[paramIdx] as unknown
          }
        }
      }
      target.updated_at = new Date('2026-01-02T00:00:00Z')
      return { rows: [makeThreadRow(target)] }
    }

    if (sql.includes('from "threads"')) {
      let rows = [...store.threads]
      const realmIdx = idx('threads', 'realm_id')
      if (realmIdx >= 0) {
        rows = rows.filter((r) => r.realm_id === params[realmIdx])
      }
      const idIdx = idx('threads', 'id')
      if (idIdx >= 0) {
        rows = rows.filter((r) => r.id === params[idIdx])
      }
      const projIdx = idx('threads', 'project_id')
      if (projIdx >= 0) {
        rows = rows.filter((r) => r.project_id === params[projIdx])
      }
      const statusIdx = idx('threads', 'status')
      if (statusIdx >= 0) {
        rows = rows.filter((r) => r.status === params[statusIdx])
      }
      if (sql.includes('limit')) {
        rows = rows.slice(0, params[params.length - 1] as number)
      }
      return { rows: rows.map(makeThreadRow) }
    }

    return { rows: [] }
  }

  return { db: drizzle(callback), store }
}

describe('driftAnchor', () => {
  it('无漂移时返回原始锚点', () => {
    const anchor = { file: 'src/auth.ts', range: { start: 10, end: 50 } }
    const result = driftAnchor(anchor, {})
    expect(result.anchor).toEqual(anchor)
    expect(result.resolved).toBe(true)
    expect(result.driftReason).toBeUndefined()
  })

  it('文件路径迁移时更新锚点 file', () => {
    const anchor = { file: 'src/auth.ts', range: { start: 10, end: 50 } }
    const result = driftAnchor(anchor, {
      fileMoves: { 'src/auth.ts': 'src/services/auth.ts' },
    })
    expect(result.anchor.file).toBe('src/services/auth.ts')
    expect(result.resolved).toBe(true)
    expect(result.driftReason).toBe('文件路径迁移')
  })

  it('锚点落在已删除文件中时标记为未解决', () => {
    const anchor = { file: 'src/auth.ts', range: { start: 10, end: 50 } }
    const result = driftAnchor(anchor, {
      deletedRanges: [{ filePath: 'src/auth.ts', startLine: 1, endLine: 100 }],
    })
    expect(result.resolved).toBe(false)
    expect(result.driftReason).toBe('锚点落在已删除文件中')
  })

  it('文件移动后锚点不在删除旧路径范围内视为有效', () => {
    const anchor = { file: 'src/auth.ts', range: { start: 10, end: 50 } }
    const result = driftAnchor(anchor, {
      fileMoves: { 'src/auth.ts': 'src/services/auth.ts' },
      deletedRanges: [{ filePath: 'src/auth.ts', startLine: 1, endLine: 100 }],
    })
    expect(result.anchor.file).toBe('src/services/auth.ts')
    expect(result.resolved).toBe(true)
    expect(result.driftReason).toBe('文件路径迁移')
  })
})

describe('createThread', () => {
  it('在 threads 表创建记录', async () => {
    const { db } = createMockDb()
    const thread = await createThread(db, TEST_REALM, {
      realmId: TEST_REALM,
      projectId: TEST_PROJECT_ID,
      title: 'New Thread',
      codeAnchor: { file: 'src/app.ts', range: { start: 1, end: 10 } },
    })
    expect(thread.id).toBeDefined()
    expect(thread.realm_id).toBe(TEST_REALM)
    expect(thread.project_id).toBe(TEST_PROJECT_ID)
    expect(thread.title).toBe('New Thread')
    expect(thread.status).toBe('open')
  })

  it('可选择传入 manifestationUrl 和 dialogueRef', async () => {
    const { db } = createMockDb()
    const thread = await createThread(db, TEST_REALM, {
      realmId: TEST_REALM,
      projectId: TEST_PROJECT_ID,
      title: 'Thread with refs',
      codeAnchor: { file: 'src/app.ts', range: { start: 1, end: 10 } },
      manifestationUrl: 'https://example.com/manifestation/1',
      dialogueRef: 'dlg-1',
    })
    expect(thread.manifestation_url).toBe('https://example.com/manifestation/1')
    expect(thread.dialogue_ref).toBe('dlg-1')
  })
})

describe('getThread', () => {
  it('按 id + Realm 查询 Thread', async () => {
    const { db } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: 'Existing Thread', status: 'open',
      code_anchor: { file: 'src/app.ts', range: { start: 5, end: 20 } },
      manifestation_url: null, dialogue_ref: null, resolution_contract: null,
      parent_thread_id: null, created_at: new Date(), updated_at: new Date(),
    }])
    const thread = await getThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(thread).not.toBeNull()
    expect(thread!.id).toBe(TEST_THREAD_ID)
    expect(thread!.title).toBe('Existing Thread')
  })

  it('Realm 不匹配时返回 null', async () => {
    const { db } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: 'other-realm', project_id: TEST_PROJECT_ID,
      title: 'Other Thread', status: 'open',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }])
    const thread = await getThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(thread).toBeNull()
  })

  it('id 不存在时返回 null', async () => {
    const { db } = createMockDb([{
      id: 'other-thread', realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: 'Other Thread', status: 'open',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }])
    const thread = await getThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(thread).toBeNull()
  })
})

describe('updateThread', () => {
  it('更新 title', async () => {
    const { db } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: 'Old Title', status: 'open',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }])
    const updated = await updateThread(db, TEST_REALM, TEST_THREAD_ID, { title: 'Updated Title' })
    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Updated Title')
  })

  it('更新 status', async () => {
    const { db } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: 'T', status: 'open',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }])
    const updated = await updateThread(db, TEST_REALM, TEST_THREAD_ID, { status: 'archived' })
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('archived')
  })

  it('Thread 不存在时返回 null', async () => {
    const { db } = createMockDb()
    const updated = await updateThread(db, TEST_REALM, 'missing', { title: 'X' })
    expect(updated).toBeNull()
  })
})

describe('deleteThread', () => {
  it('按 id + Realm 删除 Thread', async () => {
    const { db } = createMockDb([{
      id: TEST_THREAD_ID, realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: 'T', status: 'open',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }])
    const result = await deleteThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(result).toBe(true)
    const fetched = await getThread(db, TEST_REALM, TEST_THREAD_ID)
    expect(fetched).toBeNull()
  })

  it('Thread 不存在时返回 false', async () => {
    const { db } = createMockDb()
    const result = await deleteThread(db, TEST_REALM, 'missing')
    expect(result).toBe(false)
  })
})

describe('listThreads', () => {
  function makeThreads(count: number): MockThread[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `thread-${i}`, realm_id: TEST_REALM, project_id: TEST_PROJECT_ID,
      title: `Thread ${i}`, status: i % 2 === 0 ? 'open' : 'archived',
      code_anchor: {}, manifestation_url: null, dialogue_ref: null,
      resolution_contract: null, parent_thread_id: null,
      created_at: new Date(), updated_at: new Date(),
    }))
  }

  it('列出 Realm 内所有 Thread', async () => {
    const { db } = createMockDb(makeThreads(5))
    const threads = await listThreads(db, TEST_REALM)
    expect(threads).toHaveLength(5)
  })

  it('按 projectId 过滤', async () => {
    const { db } = createMockDb([
      ...makeThreads(3),
      { id: 'other-thread', realm_id: TEST_REALM, project_id: 'other-proj', title: 'Other', status: 'open', code_anchor: {}, manifestation_url: null, dialogue_ref: null, resolution_contract: null, parent_thread_id: null, created_at: new Date(), updated_at: new Date() },
    ])
    const threads = await listThreads(db, TEST_REALM, { projectId: TEST_PROJECT_ID })
    expect(threads).toHaveLength(3)
  })

  it('按 status 过滤', async () => {
    const { db } = createMockDb(makeThreads(4))
    const threads = await listThreads(db, TEST_REALM, { status: 'archived' })
    expect(threads).toHaveLength(2)
  })

  it('限制返回数量', async () => {
    const { db } = createMockDb(makeThreads(10))
    const threads = await listThreads(db, TEST_REALM, { limit: 3 })
    expect(threads).toHaveLength(3)
  })
})

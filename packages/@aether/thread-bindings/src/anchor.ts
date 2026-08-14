// @aether/thread-bindings · Code Anchor Binding：Thread CRUD + 锚点漂移迁移。
//
// Thread 是绑定了文件范围 / 代码片段 / Manifestation URL / 对话历史的叙事单元。
// code_anchor（jsonb）存储锚点信息；锚点可随代码重构自动迁移。
import { eq, type SQL } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'
import type { CodeAnchor, ThreadStatus } from '@aether/types'
import { threads } from '@aether/db'
import { realmScope } from '@aether/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ThreadDb = PgDatabase<any, any>

/** Drizzle 类型：threads 表 SELECT 行的实际类型 */
export type ThreadRecord = typeof threads.$inferSelect

export interface AnchorDriftInput {
  /** 文件路径变化（旧 → 新） */
  fileMoves?: Record<string, string>
  /** 符号引用变化（旧符号名 → 新符号名） */
  symbolRenames?: Record<string, string>
  /** 被删除的代码范围（用于检测锚点是否失效） */
  deletedRanges?: Array<{ filePath: string; startLine: number; endLine: number }>
}

export interface AnchorDriftResult {
  anchor: CodeAnchor
  /** 漂移后是否仍可定位 */
  resolved: boolean
  /** 漂移原因说明（用于 UI 展示） */
  driftReason: string | undefined
}

export interface CreateThreadInput {
  realmId: string
  projectId: string
  title: string
  codeAnchor: CodeAnchor
  manifestationUrl?: string | null
  dialogueRef?: string | null
  parentThreadId?: string | null
  resolutionContract?: Record<string, unknown> | null
}

export interface UpdateThreadInput {
  title?: string
  status?: ThreadStatus
  codeAnchor?: CodeAnchor
  manifestationUrl?: string | null
  dialogueRef?: string | null
  parentThreadId?: string | null
  resolutionContract?: Record<string, unknown> | null
}

/** 验证 Realm 隔离守卫（运行时 noop，仅用于静态检查）。 */
export function requireRealmScope(_realmId: string): void {
  // Realm isolation is enforced at query time via realmScope().
}

export async function createThread(
  db: ThreadDb,
  realmId: string,
  input: CreateThreadInput,
): Promise<ThreadRecord> {
  const id = createId()
  const [record] = await db
    .insert(threads)
    .values({
      id,
      realm_id: realmId,
      project_id: input.projectId,
      title: input.title,
      status: 'open',
      code_anchor: input.codeAnchor,
      manifestation_url: input.manifestationUrl,
      dialogue_ref: input.dialogueRef,
      resolution_contract: input.resolutionContract,
      parent_thread_id: input.parentThreadId,
    })
    .returning()
  if (!record) {
    throw new Error('threads insert returned no record')
  }
  return record
}

export async function getThread(
  db: ThreadDb,
  realmId: string,
  threadId: string,
): Promise<ThreadRecord | null> {
  const [row] = await db
    .select()
    .from(threads)
    .where(realmScope(threads, realmId, eq(threads.id, threadId)))
  return row ?? null
}

export async function updateThread(
  db: ThreadDb,
  realmId: string,
  threadId: string,
  input: UpdateThreadInput,
): Promise<ThreadRecord | null> {
  const existing = await getThread(db, realmId, threadId)
  if (existing === null) {
    return null
  }

  const updates: Partial<typeof threads.$inferInsert> = {}
  if (input.title !== undefined) updates.title = input.title
  if (input.status !== undefined) updates.status = input.status
  if (input.codeAnchor !== undefined) updates.code_anchor = input.codeAnchor
  if (input.manifestationUrl !== undefined) updates.manifestation_url = input.manifestationUrl
  if (input.dialogueRef !== undefined) updates.dialogue_ref = input.dialogueRef
  if (input.parentThreadId !== undefined) updates.parent_thread_id = input.parentThreadId
  if (input.resolutionContract !== undefined) updates.resolution_contract = input.resolutionContract

  const [row] = await db
    .update(threads)
    .set(updates)
    .where(realmScope(threads, realmId, eq(threads.id, threadId)))
    .returning()
  return row ?? null
}

export async function deleteThread(
  db: ThreadDb,
  realmId: string,
  threadId: string,
): Promise<boolean> {
  const row = await db
    .delete(threads)
    .where(realmScope(threads, realmId, eq(threads.id, threadId)))
    .returning()
  return row.length > 0
}

export async function listThreads(
  db: ThreadDb,
  realmId: string,
  options?: { projectId?: string; status?: ThreadStatus; limit?: number },
): Promise<ThreadRecord[]> {
  const conditions: SQL[] = []
  if (options?.projectId !== undefined) {
    conditions.push(eq(threads.project_id, options.projectId))
  }
  if (options?.status !== undefined) {
    conditions.push(eq(threads.status, options.status))
  }

  const scope = realmScope(threads, realmId, ...conditions)
  const query = db.select().from(threads).where(scope)
  return options?.limit !== undefined ? query.limit(options.limit) : query
}

export async function listThreadsByStatus(
  db: ThreadDb,
  realmId: string,
  status: ThreadStatus,
): Promise<ThreadRecord[]> {
  return listThreads(db, realmId, { status })
}

/**
 * 漂移 code_anchor，使其跟随代码重构而迁移。
 * 返回漂移后的锚点及结果说明。
 */
export function driftAnchor(
  anchor: CodeAnchor,
  drift: AnchorDriftInput,
): AnchorDriftResult {
  let drifted = { ...anchor }
  let driftReason: string | undefined

  // 文件路径移动
  if (drift.fileMoves !== undefined && drift.fileMoves[anchor.file] !== undefined) {
    drifted = { ...drifted, file: drift.fileMoves[anchor.file]! }
    driftReason = '文件路径迁移'
  }

  // 检查是否落在被删除的代码范围（使用漂移后的锚点）
  if (drift.deletedRanges !== undefined) {
    for (const range of drift.deletedRanges) {
      if (range.filePath === drifted.file) {
        return { anchor: drifted, resolved: false, driftReason: '锚点落在已删除文件中' }
      }
    }
  }

  return { anchor: drifted, resolved: true, driftReason }
}

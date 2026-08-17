// @aether/manifestation · Manifestation Binding
// 将 Thread 绑定到 Manifestation URL（AI 生成的代码片段、文档、图表等）。
// manifestation_url 存储在 threads 表，绑定后 Thread 可直接导航到对应产物。
//
// 与 @aether/thread-bindings 协作：
// - thread-bindings 管理 Thread 生命周期与锚点
// - manifestation 管理 Thread 的产物绑定与版本追踪
import { eq, and } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { threads } from '@aether/db'
import type { ThreadRecord } from '@aether/thread-bindings'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ManifestationDb = PgDatabase<any, any>
export interface ManifestationBinding {
  id: string
  threadId: string
  realmId: string
  url: string
  /** Manifestation 类型：如 'code-snippet'、'document'、'diagram' */
  kind: string
  /** 版本标识（用于追踪 manifestation 更新） */
  version?: string
  metadata?: Record<string, unknown>
  created_at: string
}
export interface BindManifestationInput {
  realmId: string
  threadId: string
  url: string
  kind: string
  version?: string
  metadata?: Record<string, unknown>
}
export interface UpdateManifestationBindingInput {
  url?: string
  kind?: string
  version?: string
  metadata?: Record<string, unknown>
}
/**
 * 为 Thread 绑定一个 Manifestation URL。
 * 若 Thread 已有绑定，则更新为新值。
 */
export async function bindManifestation(
  db: ManifestationDb,
  input: BindManifestationInput,
): Promise<ThreadRecord | null> {
  const [row] = await db
    .update(threads)
    .set({ manifestation_url: input.url })
    .where(and(
      eq(threads.id, input.threadId),
      eq(threads.realm_id, input.realmId),
    ))
    .returning()
  return row ?? null
}
/**
 * 解除 Thread 的 Manifestation 绑定。
 */
export async function unbindManifestation(
  db: ManifestationDb,
  realmId: string,
  threadId: string,
): Promise<ThreadRecord | null> {
  const [row] = await db
    .update(threads)
    .set({ manifestation_url: null })
    .where(and(
      eq(threads.id, threadId),
      eq(threads.realm_id, realmId),
    ))
    .returning()
  return row ?? null
}
/**
 * 查询 Thread 的 Manifestation URL。
 */
export async function getManifestation(
  db: ManifestationDb,
  realmId: string,
  threadId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ url: threads.manifestation_url })
    .from(threads)
    .where(and(
      eq(threads.id, threadId),
      eq(threads.realm_id, realmId),
    ))
  return row?.url ?? null
}
/**
 * 列出某 Thread 当前绑定的 Manifestation URL。
 * P3-23 修复：注释与实现对齐——当前实现直接读 threads 表返回当前 URL，
 * 历史绑定追踪需配合 audit_log 回溯（待 M3.7 完善）。
 */
export async function listManifestationsByThread(
  db: ManifestationDb,
  realmId: string,
  threadId: string,
): Promise<string[]> {
  const url = await getManifestation(db, realmId, threadId)
  return url ? [url] : []
}

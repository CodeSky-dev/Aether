// @aether/web · Entity Presence Server Actions
// 光标状态存 currents.presence_snapshot（jsonb），结构为 Record<sessionId, PresenceEntry>。
// 轮询通道阶段无 WebSocket，靠 2s 轮询传播；Hocuspocus 接入后切换 awareness 广播。
'use server'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { currents } from '@aether/db'
import type { ActorType } from '@aether/types'
import { requireRealmAccess } from '@/lib/auth-guard'
export interface PresenceEntry {
  actor_id: string
  actor_type: ActorType
  actor_name: string
  doc_ref: string
  cursor_offset: number
  selection_start: number | null
  selection_end: number | null
  /** ISO 时间戳；超过 PRESENCE_TTL_MS 视为离线 */
  last_active_at: string
}
/** Presence 有效期；客户端心跳 3s，轮询 2s，30s 足够容错（'use server' 文件仅可导出 async 函数，故不导出） */
const PRESENCE_TTL_MS = 30_000
type PresenceMap = Record<string, PresenceEntry>
function asPresenceMap(raw: unknown): PresenceMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as PresenceMap
}
/** 读取 doc 的在线实体光标（已过滤过期与会话自身）。 */
export async function getPresence(
  realmId: string,
  docRef: string,
  excludeSessionId?: string,
): Promise<PresenceEntry[]> {
  // P2-18 修复：鉴权守卫
  await requireRealmAccess(realmId)
  const db = getDb()
  const rows = await db
    .select({ presence_snapshot: currents.presence_snapshot })
    .from(currents)
    .where(and(eq(currents.realm_id, realmId), eq(currents.doc_ref, docRef)))
    .limit(1)
  if (rows.length === 0) return []
  const map = asPresenceMap(rows[0]?.presence_snapshot)
  const now = Date.now()
  return Object.entries(map)
    .filter(([sessionId]) => sessionId !== excludeSessionId)
    .map(([, entry]) => entry)
    .filter(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        now - new Date(entry.last_active_at).getTime() < PRESENCE_TTL_MS,
    )
}
/**
 * 心跳上报：插入或更新本会话光标。
 * P2-13 修复：使用 Postgres JSONB `||` 操作符做原子合并，
 * 替代 read-modify-write 整包覆写，避免多 session 并发上报互相覆盖。
 */
export async function setPresence(
  realmId: string,
  docRef: string,
  sessionId: string,
  entry: Omit<PresenceEntry, 'doc_ref' | 'last_active_at'> & {
    last_active_at?: string
  },
): Promise<void> {
  // P2-18 修复：鉴权守卫
  await requireRealmAccess(realmId)
  const db = getDb()
  const nowIso = entry.last_active_at ?? new Date().toISOString()
  const full: PresenceEntry = { ...entry, doc_ref: docRef, last_active_at: nowIso }
  const existing = await db
    .select({ id: currents.id })
    .from(currents)
    .where(and(eq(currents.realm_id, realmId), eq(currents.doc_ref, docRef)))
    .limit(1)
  const row = existing[0]
  if (row) {
    // 原子 JSONB 合并：presence_snapshot = presence_snapshot || {sessionId: full}
    // Postgres `||` 对 JSONB 对象做浅合并，不同 sessionId 的 key 互不覆盖。
    await db
      .update(currents)
      .set({
        presence_snapshot: sql`${currents.presence_snapshot} || ${JSON.stringify({ [sessionId]: full })}::jsonb`,
        updated_at: new Date(),
      })
      .where(eq(currents.id, row.id))
    return
  }
  // 首次上报：创建 currents 行
  // 注意：并发下可能产生多行，读取时按 doc_ref 取第一行即可；
  // 后续可加 (realm_id, doc_ref) 唯一索引 + ON CONFLICT 彻底消除。
  await db.insert(currents).values({
    realm_id: realmId,
    doc_ref: docRef,
    presence_snapshot: { [sessionId]: full } satisfies PresenceMap,
  })
}
/**
 * 会话离线：移除本会话光标。
 * P2-13 修复：使用 Postgres JSONB `-` 操作符原子删除 key，
 * 替代 read-modify-write，避免并发删除互相覆盖。
 */
export async function deletePresence(
  realmId: string,
  docRef: string,
  sessionId: string,
): Promise<void> {
  // P2-18 修复：鉴权守卫
  await requireRealmAccess(realmId)
  const db = getDb()
  const existing = await db
    .select({ id: currents.id })
    .from(currents)
    .where(and(eq(currents.realm_id, realmId), eq(currents.doc_ref, docRef)))
    .limit(1)
  const row = existing[0]
  if (!row) return
  // 原子 JSONB 删除：presence_snapshot = presence_snapshot - 'sessionId'
  await db
    .update(currents)
    .set({
      presence_snapshot: sql`${currents.presence_snapshot} - ${sessionId}`,
      updated_at: new Date(),
    })
    .where(eq(currents.id, row.id))
}

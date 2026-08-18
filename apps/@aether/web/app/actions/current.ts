// @aether/web · Current 状态通道 Server Actions
// 客户端 CRDT 更新经此落库，服务端广播回其他客户端。
// 序列化统一走 @aether/current-sync 的 serializeUpdate/deserializeUpdate。
// 这是探测文档定义的「非权威通道」——Hocuspocus 接入后承担权威 WebSocket 收敛。
'use server'
import { getDb } from '@/lib/db'
import { getBroadcastPort } from '@/lib/current/broadcast'
import { requireEntitlement, requireRealmAccess } from '@/lib/auth-guard'
import {
  appendUpdate,
  getCursor,
  replayUpdates,
  type AppendUpdateInput,
  type AppendUpdateResult,
  type ReplayResult,
} from '@/lib/current/channel-service'
export type { AppendUpdateInput, AppendUpdateResult, ReplayResult }
/**
 * 追加一条 CRDT 增量并落库 + 广播。
 * 幂等：同一 (docRef, idempotencyKey) 只落库一次。
 */
export async function appendCurrentUpdate(
  input: AppendUpdateInput,
): Promise<AppendUpdateResult> {
  // P2-18 修复：鉴权守卫 —— 防止向任意 doc 写入
  await requireEntitlement(input.realmId, {
    resource: 'current',
    action: 'converge',
    resourceId: input.docRef,
  })
  const db = getDb()
  const broadcast = getBroadcastPort()
  return appendUpdate(db, broadcast, input)
}
/**
 * 游标重放：读取 doc 指定 seq 之后的增量。
 * 客户端用 nextCursor 作为下次轮询的 afterSeq。
 */
export async function replayCurrentUpdates(
  realmId: string,
  docRef: string,
  afterSeq: number | null,
  limit?: number,
): Promise<ReplayResult> {
  // P2-18 修复：鉴权守卫
  await requireRealmAccess(realmId)
  const db = getDb()
  return replayUpdates(db, realmId, docRef, afterSeq, limit)
}
/**
 * 读取 doc 当前最大 seq，用于客户端初始化重放游标。
 */
export async function getCurrentCursor(
  realmId: string,
  docRef: string,
): Promise<{ cursor: number | null }> {
  // P2-18 修复：鉴权守卫
  await requireRealmAccess(realmId)
  const db = getDb()
  return getCursor(db, realmId, docRef)
}

// @aether/entity-core · Entity Audit Trail 埋点
// 全部 Entity 操作写入 audit_log：操作者、时间、目标、载荷摘要、结果。
// 与人类操作统一入账，不可变、可导出，覆盖 AI 行为本身。
//
// 设计要点：
// - audit_log 是 append-only：即使 Entity 因网络重试导致重复提交，也保留全部记录（审计可见重试）。
// - idempotency_key 由 Entity 强制携带：用于 Entity 业务操作去重（对应 risks.md 风险 6），
//   audit_log 层面不依赖 unique 约束去重，而是记录每次尝试。
// - payload_hash 是 sha256 摘要：原始载荷由 caller 保留，审计记录只存摘要防篡改。
// - 强制 Realm 隔离：所有查询经 realmScope 守卫。
import { desc, eq, type SQL } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { createHash } from 'node:crypto'
import { auditLog, realmScope } from '@aether/db'
import type { ActorType, AuditAction } from '@aether/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditDb = PgDatabase<any, any>

export type AuditLogRecord = typeof auditLog.$inferSelect

export interface AuditRecordInput {
  actorType: ActorType
  actorId: string
  action: AuditAction
  /** 目标对象：表名/资源引用/操作上下文 */
  target: Record<string, unknown>
  /** 原始载荷（用于计算 payload_hash）；不直接落库 */
  payload: Uint8Array | string | Record<string, unknown>
  /** 幂等键：Entity 操作强制携带，用于业务层去重 */
  idempotencyKey: string
  /** 操作结果摘要 */
  result?: Record<string, unknown>
}

export interface AuditQueryFilter {
  actorType?: ActorType
  actorId?: string
  action?: AuditAction
  limit?: number
}

/**
 * 计算 payload 的 sha256 摘要（hex）。
 * 用于防篡改：审计记录只存摘要，原始载荷由 caller 自行保留。
 */
export function computePayloadHash(
  payload: Uint8Array | string | Record<string, unknown>,
): string {
  const hash = createHash('sha256')
  if (typeof payload === 'string') {
    hash.update(payload, 'utf8')
  } else if (payload instanceof Uint8Array) {
    hash.update(payload)
  } else {
    hash.update(JSON.stringify(payload), 'utf8')
  }
  return hash.digest('hex')
}

/**
 * 记录一条操作到审计轨迹（人类或 Entity 通用）。
 * audit_log 是 append-only，不做幂等去重（保留全部尝试记录）。
 * idempotency_key 用于业务层去重，审计层只记录。
 */
export async function recordAudit(
  db: AuditDb,
  realmId: string,
  input: AuditRecordInput,
): Promise<AuditLogRecord> {
  const payloadHash = computePayloadHash(input.payload)
  const [record] = await db
    .insert(auditLog)
    .values({
      realm_id: realmId,
      actor_type: input.actorType,
      actor_id: input.actorId,
      action: input.action,
      target: input.target,
      payload_hash: payloadHash,
      idempotency_key: input.idempotencyKey,
      result: input.result ?? {},
    })
    .returning()
  if (!record) {
    throw new Error('audit_log insert returned no record')
  }
  return record
}

/**
 * Entity 操作审计便捷方法：自动填充 actor_type='entity'。
 */
export async function recordEntityAction(
  db: AuditDb,
  realmId: string,
  entityId: string,
  input: {
    action: AuditAction
    target: Record<string, unknown>
    payload: Uint8Array | string | Record<string, unknown>
    idempotencyKey: string
    result?: Record<string, unknown>
  },
): Promise<AuditLogRecord> {
  return recordAudit(db, realmId, {
    actorType: 'entity',
    actorId: entityId,
    action: input.action,
    target: input.target,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    ...(input.result !== undefined ? { result: input.result } : {}),
  })
}

/**
 * 按 Realm 隔离查询审计轨迹。
 * 默认按 created_at 降序，可通过 filter 限制 actor/action/limit。
 */
export async function queryAuditLog(
  db: AuditDb,
  realmId: string,
  filter: AuditQueryFilter = {},
): Promise<AuditLogRecord[]> {
  const conditions: SQL[] = []
  if (filter.actorType !== undefined) {
    conditions.push(eq(auditLog.actor_type, filter.actorType))
  }
  if (filter.actorId !== undefined) {
    conditions.push(eq(auditLog.actor_id, filter.actorId))
  }
  if (filter.action !== undefined) {
    conditions.push(eq(auditLog.action, filter.action))
  }

  const scope = realmScope(auditLog, realmId, ...conditions)
  const query = db
    .select()
    .from(auditLog)
    .where(scope)
    .orderBy(desc(auditLog.created_at))
  return filter.limit !== undefined ? query.limit(filter.limit) : query
}

/**
 * 查询指定 Entity 的审计历史（按时间降序）。
 */
export async function queryEntityAuditLog(
  db: AuditDb,
  realmId: string,
  entityId: string,
  filter: Omit<AuditQueryFilter, 'actorType' | 'actorId'> = {},
): Promise<AuditLogRecord[]> {
  return queryAuditLog(db, realmId, {
    ...filter,
    actorType: 'entity',
    actorId: entityId,
  })
}

/**
 * 检查某 idempotency_key 是否已被某 Entity 使用过。
 * 用于 Entity 业务操作的前置去重检查（落库前快速判重）。
 * 注意：这是 best-effort 检查，并发场景需配合 db 唯一约束。
 */
export async function hasEntityActionBeenRecorded(
  db: AuditDb,
  realmId: string,
  entityId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const conditions: SQL[] = [
    eq(auditLog.actor_type, 'entity'),
    eq(auditLog.actor_id, entityId),
    eq(auditLog.idempotency_key, idempotencyKey),
  ]
  const scope = realmScope(auditLog, realmId, ...conditions)
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(scope)
    .limit(1)
  return rows.length > 0
}

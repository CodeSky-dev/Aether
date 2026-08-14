// @aether/entity-core · Entity Identity
// Entity 在 entities 表的档案管理 + 与 members 表的 Realm 成员关系联动。
// 身份认证由 Better-Auth 承载（@aether/auth），本模块负责业务档案 CRUD。
//
// 生命周期：
//   register (idle) → start (active) → handoff (waiting) → approve/reject
//                  → suspend (suspended) → resume (active)
//
// 设计要点：
// - registerEntity 同时写 entities + members（actor_type='entity'），保证档案与成员关系一致。
// - 吊销是软删除：标记 suspended，保留档案供审计。
// - capability_manifesto 落库为 jsonb（弱类型），读取时经 validateCapabilityManifesto 校验。
import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { entities, members, realmScope } from '@aether/db'
import type { EntityStatus } from '@aether/types'
import {
  declareCapabilityManifesto,
  toStoredManifesto,
  validateCapabilityManifesto,
  type CapabilityManifesto,
} from './manifesto.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityDb = PgDatabase<any, any>

export type EntityRecord = typeof entities.$inferSelect

export interface RegisterEntityInput {
  readonly realmId: string
  /** Better-Auth 身份标识（由 @aether/auth 在身份提供方侧创建） */
  readonly authIdentityId: string
  readonly displayName: string
  readonly manifesto: CapabilityManifesto
  /** members.role，默认 'member' */
  readonly role?: string
  /** 初始 memory_ref，默认空对象 */
  readonly memoryRef?: Record<string, unknown>
}

export interface UpdateEntityInput {
  readonly displayName?: string
  readonly manifesto?: CapabilityManifesto
  readonly memoryRef?: Record<string, unknown>
  readonly status?: EntityStatus
}

/**
 * 注册 Entity：在 entities 表建档案 + 在 members 表加入 Realm。
 * 不创建 Better-Auth 身份（身份由 @aether/auth 在身份提供方侧创建）。
 * 初始状态为 idle，需调用方显式 start 才能进入 active。
 */
export async function registerEntity(
  db: EntityDb,
  input: RegisterEntityInput,
): Promise<EntityRecord> {
  const storedManifesto = toStoredManifesto(input.manifesto)
  const [entity] = await db
    .insert(entities)
    .values({
      realm_id: input.realmId,
      auth_identity_id: input.authIdentityId,
      display_name: input.displayName,
      capability_manifesto: storedManifesto,
      memory_ref: input.memoryRef ?? {},
      status: 'idle',
    })
    .returning()
  if (!entity) {
    throw new Error('entities insert returned no record')
  }

  // 在 members 表加入 Realm（actor_type='entity'，Realm 级成员）
  await db.insert(members).values({
    realm_id: input.realmId,
    project_id: null,
    actor_type: 'entity',
    actor_id: entity.id,
    role: input.role ?? 'member',
    entitlements: {},
    status: 'active',
  })

  return entity
}

/**
 * 按 id 查询 Entity 档案（带 Realm 隔离）。
 */
export async function getEntity(
  db: EntityDb,
  realmId: string,
  entityId: string,
): Promise<EntityRecord | null> {
  const [row] = await db
    .select()
    .from(entities)
    .where(realmScope(entities, realmId, eq(entities.id, entityId)))
  return row ?? null
}

/**
 * 按 auth_identity_id 查询 Entity（跨 Realm，用于身份解析）。
 * 返回全部匹配的档案（同一身份可能被多个 Realm 引用）。
 */
export async function getEntitiesByAuthIdentity(
  db: EntityDb,
  authIdentityId: string,
): Promise<EntityRecord[]> {
  return db
    .select()
    .from(entities)
    .where(eq(entities.auth_identity_id, authIdentityId))
}

/**
 * 列出 Realm 内所有 Entity（带 Realm 隔离）。
 */
export async function listEntities(
  db: EntityDb,
  realmId: string,
): Promise<EntityRecord[]> {
  return db.select().from(entities).where(realmScope(entities, realmId))
}

/**
 * 更新 Entity 档案。
 * 仅更新提供的字段，未提供的保持不变。
 */
export async function updateEntity(
  db: EntityDb,
  realmId: string,
  entityId: string,
  input: UpdateEntityInput,
): Promise<EntityRecord | null> {
  const updates: Partial<typeof entities.$inferInsert> = {}
  if (input.displayName !== undefined) {
    updates.display_name = input.displayName
  }
  if (input.manifesto !== undefined) {
    updates.capability_manifesto = toStoredManifesto(input.manifesto)
  }
  if (input.memoryRef !== undefined) {
    updates.memory_ref = input.memoryRef
  }
  if (input.status !== undefined) {
    updates.status = input.status
  }

  if (Object.keys(updates).length === 0) {
    return getEntity(db, realmId, entityId)
  }

  const [row] = await db
    .update(entities)
    .set(updates)
    .where(realmScope(entities, realmId, eq(entities.id, entityId)))
    .returning()
  return row ?? null
}

/**
 * 吊销 Entity：标记 entities.status='suspended' + members.status='suspended'。
 * 软删除：保留档案供审计，不删除记录。
 */
export async function suspendEntity(
  db: EntityDb,
  realmId: string,
  entityId: string,
): Promise<EntityRecord | null> {
  const [entity] = await db
    .update(entities)
    .set({ status: 'suspended' })
    .where(realmScope(entities, realmId, eq(entities.id, entityId)))
    .returning()
  if (!entity) {
    return null
  }

  // 同步 members 表状态（actor_type='entity' 且 actor_id=entityId）
  await db
    .update(members)
    .set({ status: 'suspended' })
    .where(
      realmScope(
        members,
        realmId,
        eq(members.actor_type, 'entity'),
        eq(members.actor_id, entityId),
      ),
    )

  return entity
}

/**
 * 从 db 记录解析出强类型 Capability Manifesto。
 * db 中 capability_manifesto 是 jsonb（弱类型），经校验转为强类型。
 * 若 manifesto 无效（数据损坏或版本不兼容），返回空 manifesto 避免运行时崩溃。
 */
export function parseEntityManifesto(
  entity: EntityRecord,
): CapabilityManifesto {
  const result = validateCapabilityManifesto(entity.capability_manifesto)
  if (!result.ok || result.manifesto === null) {
    return declareCapabilityManifesto()
  }
  return result.manifesto
}

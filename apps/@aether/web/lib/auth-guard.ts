// @aether/web · 轻量鉴权守卫（M1 占位层）
// P2-18 修复：M1 阶段无完整 auth 体系，提供可关闭的基础守卫：
//   1. 校验 realmId 为合法 UUID（防止注入/越权遍历）
//   2. 校验 Realm 存在（防止操作不存在的租户）
// 后续接入 Entitlement Engine（M3）后，在此处扩展角色/权限判定。
//
// 环境变量 AETHER_AUTH_GUARD_ENABLED 控制是否启用（默认 true）。
// 开发调试时可设为 false 关闭守卫。
'use server'
import { getDb } from '@/lib/db'
import { realms } from '@aether/db'
import { eq } from 'drizzle-orm'
import {
  assertEntitlement,
  loadEntitlementSubject,
  type EntitlementRequest,
} from '@aether/entitlement'
import type { ActorType } from '@aether/types'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isGuardEnabled(): boolean {
  return process.env.AETHER_AUTH_GUARD_ENABLED !== 'false'
}
function isEntitlementEnabled(): boolean {
  return process.env.AETHER_ENTITLEMENT_ENABLED === 'true'
}
let entitlementDisabledNoticeLogged = false
export interface CurrentActor {
  actorType: ActorType
  actorId: string
}
/**
 * 解析当前请求主体。
 * M3.8 阶段暂不接入 Better-Auth session，待 SSO/SCIM 落地后实现。
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function resolveCurrentActor(): Promise<CurrentActor | null> {
  return null
}
/**
 * 校验 realmId 格式并确认 Realm 存在。
 * @throws Error 当 realmId 格式非法或 Realm 不存在时
 */
export async function requireRealmAccess(realmId: string): Promise<void> {
  if (!isGuardEnabled()) return
  if (!UUID_REGEX.test(realmId)) {
    throw new Error('Invalid realmId: must be a valid UUID')
  }
  const db = getDb()
  const existing = await db
    .select({ id: realms.id })
    .from(realms)
    .where(eq(realms.id, realmId))
    .limit(1)
  if (existing.length === 0) {
    throw new Error(`Realm not found: ${realmId}`)
  }
}

/**
 * 在 Realm 存在性校验后执行 Entitlement Engine 判定。
 * 开关关闭时保持现有 M1/M3.5 行为，仅记录 debug 日志并放行。
 */
export async function requireEntitlement(
  realmId: string,
  request: EntitlementRequest,
): Promise<void> {
  await requireRealmAccess(realmId)
  if (!isEntitlementEnabled()) {
    if (!entitlementDisabledNoticeLogged) {
      entitlementDisabledNoticeLogged = true
      // eslint-disable-next-line no-console
      console.debug('[auth-guard] Entitlement Engine disabled; allowing request')
    }
    return
  }

  const actor = await resolveCurrentActor()
  if (actor === null) {
    throw new Error(
      'Entitlement denied fail-closed: no authenticated actor could be resolved',
    )
  }
  const subject = await loadEntitlementSubject(getDb(), {
    realmId,
    actorType: actor.actorType,
    actorId: actor.actorId,
  })
  assertEntitlement(subject, request)
}

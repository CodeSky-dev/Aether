// @aether/web · Better-Auth 到 Aether membership 的 JIT 镜像
'use server'

import {
  findOrganizationMemberRoles,
} from '@aether/auth'
import {
  auditLog,
  members,
  realms,
  realmGuard,
} from '@aether/db'
import type { ActorType } from '@aether/types'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { tryGetAuth } from '@/lib/auth'
import { isPlaceholderOrganization } from '@/lib/membership-utils'

const KNOWN_ROLES = new Set(['owner', 'admin', 'member'])
const warnedUnknownRoles = new Set<string>()

export interface EnsureRealmMembershipInput {
  realmId: string
  actorType: ActorType
  actorId: string
}

function warnUnknownRole(role: string): void {
  if (warnedUnknownRoles.has(role)) return
  warnedUnknownRoles.add(role)
  // eslint-disable-next-line no-console
  console.warn(`[membership] Unknown Better-Auth organization role skipped: ${role}`)
}

export async function ensureRealmMembership(
  input: EnsureRealmMembershipInput,
): Promise<void> {
  const db = getDb()
  const activeMembership = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        realmGuard(members, input.realmId),
        eq(members.actor_type, input.actorType),
        eq(members.actor_id, input.actorId),
        eq(members.status, 'active'),
      ),
    )
    .limit(1)

  if (activeMembership.length > 0) return
  if (input.actorType !== 'human') return

  const [realm] = await db
    .select({ authOrgId: realms.auth_org_id })
    .from(realms)
    .where(eq(realms.id, input.realmId))
    .limit(1)
  if (!realm || isPlaceholderOrganization(realm.authOrgId)) return

  const auth = tryGetAuth()
  if (auth === null) return

  const roles = await findOrganizationMemberRoles(db, {
    organizationId: realm.authOrgId,
    userId: input.actorId,
  })
  const knownRoles = roles.filter((role) => {
    if (KNOWN_ROLES.has(role)) return true
    warnUnknownRole(role)
    return false
  })
  if (knownRoles.length === 0) return

  await db.transaction(async (tx) => {
    for (const role of knownRoles) {
      const inserted = await tx
        .insert(members)
        .values({
          realm_id: input.realmId,
          project_id: null,
          actor_type: input.actorType,
          actor_id: input.actorId,
          role,
          entitlements: {},
          status: 'active',
        })
        .onConflictDoNothing()
        .returning({ id: members.id })

      if (inserted.length === 0) continue
      await tx.insert(auditLog).values({
        realm_id: input.realmId,
        actor_type: input.actorType,
        actor_id: input.actorId,
        action: 'permission_change',
        target: {
          kind: 'realm_membership',
          role,
          actor_id: input.actorId,
        },
        payload_hash: `membership:${input.realmId}:${input.actorId}:${role}`,
        idempotency_key: `membership:${input.realmId}:${input.actorId}:${role}`,
        result: { status: 'active' },
      })
    }
  })
}

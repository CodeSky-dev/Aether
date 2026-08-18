// @aether/web · Realm membership 邀请 Server Actions
'use server'

import {
  acceptOrganizationInvitation,
  inviteToOrganization,
  listOrganizationInvitations,
  type RealmOrganizationRole,
} from '@aether/auth'
import { realms } from '@aether/db'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { getDb } from '@/lib/db'
import { ensureRealmMembership } from '@/lib/membership-provisioning'
import { isPlaceholderOrganization } from '@/lib/membership-utils'
import {
  requireEntitlement,
  resolveCurrentActor,
} from '@/lib/auth-guard'
import { tryGetAuth } from '@/lib/auth'

const ALLOWED_ROLES = new Set(['owner', 'admin', 'member'])

function isAllowedRole(role: string): role is RealmOrganizationRole {
  return ALLOWED_ROLES.has(role)
}

interface RealmOrganization {
  id: string
  authOrgId: string
}

async function getRealmOrganization(
  realmId: string,
): Promise<RealmOrganization> {
  const [realm] = await getDb()
    .select({ id: realms.id, authOrgId: realms.auth_org_id })
    .from(realms)
    .where(eq(realms.id, realmId))
    .limit(1)
  if (!realm) throw new Error(`Realm not found: ${realmId}`)
  if (isPlaceholderOrganization(realm.authOrgId)) {
    throw new Error(
      'Realm is not bound to a Better-Auth organization; rebuild or bind the Realm first',
    )
  }
  return realm
}

function requireAuth() {
  const auth = tryGetAuth()
  if (auth === null) {
    throw new Error(
      'Better-Auth is not configured; authenticate and configure BETTER_AUTH_URL and BETTER_AUTH_SECRET first',
    )
  }
  return auth
}

export interface InviteRealmMemberInput {
  realmId: string
  email: string
  role: string
}

export async function inviteRealmMember(
  input: InviteRealmMemberInput,
) {
  await requireEntitlement(input.realmId, {
    resource: 'realm',
    action: 'manage_member',
  })
  const realm = await getRealmOrganization(input.realmId)
  if (!isAllowedRole(input.role)) {
    throw new Error('Invalid membership role: expected owner, admin, or member')
  }
  return inviteToOrganization(requireAuth(), await headers(), {
    organizationId: realm.authOrgId,
    email: input.email,
    role: input.role,
  })
}

export interface ListRealmInvitationsInput {
  realmId: string
}

export async function listRealmInvitations(
  input: ListRealmInvitationsInput,
) {
  await requireEntitlement(input.realmId, {
    resource: 'realm',
    action: 'read',
  })
  const realm = await getRealmOrganization(input.realmId)
  return listOrganizationInvitations(requireAuth(), await headers(), {
    organizationId: realm.authOrgId,
  })
}

export interface AcceptRealmInvitationInput {
  invitationId: string
}

export async function acceptRealmInvitation(
  input: AcceptRealmInvitationInput,
) {
  const actor = await resolveCurrentActor()
  if (actor === null) {
    throw new Error(
      'Cannot accept a Realm invitation without an authenticated session',
    )
  }
  const result = await acceptOrganizationInvitation(
    requireAuth(),
    await headers(),
    input,
  )
  const organizationId = result.invitation.organizationId
  const [realm] = await getDb()
    .select({ id: realms.id })
    .from(realms)
    .where(eq(realms.auth_org_id, organizationId))
    .limit(1)
  if (!realm) {
    throw new Error('Accepted invitation is not bound to an Aether Realm')
  }
  await ensureRealmMembership({
    realmId: realm.id,
    actorType: actor.actorType,
    actorId: actor.actorId,
  })
  return result
}

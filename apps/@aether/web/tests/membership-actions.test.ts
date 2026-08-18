import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptOrganizationInvitation,
  inviteToOrganization,
} from '@aether/auth'
import { getDb } from '@/lib/db'
import {
  requireEntitlement,
  resolveCurrentActor,
} from '@/lib/auth-guard'
import { tryGetAuth } from '@/lib/auth'
import { ensureRealmMembership } from '@/lib/membership'
import {
  acceptRealmInvitation,
  inviteRealmMember,
  listRealmInvitations,
} from '@/app/actions/membership'

vi.mock('@aether/auth', () => ({
  acceptOrganizationInvitation: vi.fn(),
  inviteToOrganization: vi.fn(),
  listOrganizationInvitations: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('@/lib/auth-guard', () => ({
  requireEntitlement: vi.fn(),
  resolveCurrentActor: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  tryGetAuth: vi.fn(),
}))

vi.mock('@/lib/membership', () => ({
  ensureRealmMembership: vi.fn(),
}))

vi.mock('@/lib/membership-utils', () => ({
  isPlaceholderOrganization: (id: string) =>
    id.startsWith('org-placeholder-'),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers({ cookie: 'session=token' }))),
}))

const mockedGetDb = vi.mocked(getDb)
const mockedRequireEntitlement = vi.mocked(requireEntitlement)
const mockedResolveCurrentActor = vi.mocked(resolveCurrentActor)
const mockedTryGetAuth = vi.mocked(tryGetAuth)
const mockedInvite = vi.mocked(inviteToOrganization)

function mockRealm(authOrgId: string) {
  mockedGetDb.mockReturnValue({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: 'realm-1', authOrgId }]),
        })),
      })),
    })),
  } as never)
}

describe('membership actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedTryGetAuth.mockReturnValue({} as NonNullable<ReturnType<typeof tryGetAuth>>)
    mockedResolveCurrentActor.mockResolvedValue({
      actorType: 'human',
      actorId: 'user-1',
    })
  })

  it('rejects unsupported invitation roles', async () => {
    mockRealm('org-1')

    await expect(
      inviteRealmMember({
        realmId: 'realm-1',
        email: 'member@example.com',
        role: 'owner,admin',
      }),
    ).rejects.toThrow('Invalid membership role')
    expect(mockedInvite).not.toHaveBeenCalled()
  })

  it('reports placeholder organization binding errors', async () => {
    mockRealm('org-placeholder-1')

    await expect(
      listRealmInvitations({ realmId: 'realm-1' }),
    ).rejects.toThrow('not bound to a Better-Auth organization')
    expect(mockedRequireEntitlement).not.toHaveBeenCalled()
  })

  it('checks manage_member before inviting', async () => {
    mockRealm('org-1')

    await inviteRealmMember({
      realmId: 'realm-1',
      email: 'member@example.com',
      role: 'member',
    })

    expect(mockedRequireEntitlement).toHaveBeenCalledWith('realm-1', {
      resource: 'realm',
      action: 'manage_member',
    })
  })

  it('accepts with the session and mirrors the resulting organization', async () => {
    vi.mocked(acceptOrganizationInvitation).mockResolvedValue({
      invitation: { organizationId: 'org-1' },
    } as never)
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 'realm-1' }]),
          })),
        })),
      })),
    } as never)

    await acceptRealmInvitation({ invitationId: 'invite-1' })

    expect(acceptOrganizationInvitation).toHaveBeenCalled()
    expect(vi.mocked(ensureRealmMembership)).toHaveBeenCalledWith({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })
  })
})

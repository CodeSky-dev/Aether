import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureRealmMembership } from '@/lib/membership'
import { findOrganizationMemberRoles } from '@aether/auth'
import { tryGetAuth } from '@/lib/auth'
import { getDb } from '@/lib/db'

vi.mock('@aether/auth', () => ({
  findOrganizationMemberRoles: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  tryGetAuth: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}))

const mockedFindRoles = vi.mocked(findOrganizationMemberRoles)
const mockedTryGetAuth = vi.mocked(tryGetAuth)
const mockedGetDb = vi.mocked(getDb)

function createSelectQueue(results: unknown[][]) {
  let index = 0
  return vi.fn(() => {
    const result = results[index] ?? []
    index += 1
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    }
  })
}

describe('ensureRealmMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedTryGetAuth.mockReturnValue({} as NonNullable<ReturnType<typeof tryGetAuth>>)
  })

  it('returns on the active membership fast path without querying Better-Auth', async () => {
    const select = createSelectQueue([[{ id: 'membership-1' }]])
    mockedGetDb.mockReturnValue({ select } as never)

    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })

    expect(mockedFindRoles).not.toHaveBeenCalled()
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('mirrors known multi-roles and does not duplicate conflicts', async () => {
    const select = createSelectQueue([[], [{ authOrgId: 'org-1' }]])
    const insertedRoles = ['admin', 'member']
    let insertCount = 0
    const db = {
      select,
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn(() => {
            insertCount += 1
            if (insertCount % 2 === 0) {
              return {
                values: vi.fn(() => ({
                  returning: vi.fn().mockResolvedValue([]),
                })),
              }
            }
            const role = insertedRoles[Math.floor(insertCount / 2)]
            return {
              values: vi.fn(() => ({
                onConflictDoNothing: vi.fn(() => ({
                  returning: vi.fn().mockResolvedValue([{ id: role }]),
                })),
              })),
            }
          }),
        }
        await callback(tx)
      }),
    }
    mockedGetDb.mockReturnValue(db as never)
    mockedFindRoles.mockResolvedValue(['admin', 'member'])

    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })

    expect(mockedFindRoles).toHaveBeenCalledWith(db, {
      organizationId: 'org-1',
      userId: 'user-1',
    })
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not write when the organization member is not found', async () => {
    const select = createSelectQueue([[], [{ authOrgId: 'org-1' }]])
    const transaction = vi.fn()
    mockedGetDb.mockReturnValue({ select, transaction } as never)
    mockedFindRoles.mockResolvedValue([])

    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  it('skips unknown roles and warns once', async () => {
    const select = createSelectQueue([[], [{ authOrgId: 'org-1' }]])
    const transaction = vi.fn()
    mockedGetDb.mockReturnValue({ select, transaction } as never)
    mockedFindRoles.mockResolvedValue(['unknown-role'])
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })
    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })

    expect(warning).toHaveBeenCalledTimes(1)
    expect(transaction).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('is a no-op for placeholder organizations', async () => {
    const select = createSelectQueue([[], [{ authOrgId: 'org-placeholder-1' }]])
    const transaction = vi.fn()
    mockedGetDb.mockReturnValue({ select, transaction } as never)

    await ensureRealmMembership({
      realmId: 'realm-1',
      actorType: 'human',
      actorId: 'user-1',
    })

    expect(mockedFindRoles).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})

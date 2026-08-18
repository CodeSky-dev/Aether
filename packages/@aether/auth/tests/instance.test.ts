import { describe, expect, it, vi } from 'vitest'

vi.mock('better-auth', () => ({
  betterAuth: vi.fn((options: unknown) => options),
}))
vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({})),
}))
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: vi.fn(),
}))
vi.mock('better-auth/plugins', () => ({
  organization: vi.fn((options: unknown) => options),
}))

import { createAuth } from '../src/instance.js'

describe('createAuth invitation mailer', () => {
  it('maps Better-Auth invitation data to the injected mailer', async () => {
    const sendInvitation = vi.fn().mockResolvedValue(undefined)
    const config = createAuth({
      db: {},
      baseURL: 'https://aether.example',
      secret: 'test-secret',
      mailer: { sendInvitation },
    }) as unknown as {
      plugins: unknown[]
    }
    const plugin = config.plugins[0] as {
      sendInvitationEmail: (data: {
        id: string
        email: string
        role: string
        organization: { name: string }
        invitation: unknown
        inviter: unknown
      }) => Promise<void>
    }

    await plugin.sendInvitationEmail({
      id: 'invite-1',
      email: 'member@example.com',
      role: 'admin',
      organization: { name: 'Aether' },
      invitation: {},
      inviter: {},
    })

    expect(sendInvitation).toHaveBeenCalledWith({
      to: 'member@example.com',
      realmName: 'Aether',
      role: 'admin',
      acceptUrl: 'https://aether.example/invitations/invite-1',
    })
  })
})

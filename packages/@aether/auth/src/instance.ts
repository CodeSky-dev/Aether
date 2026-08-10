// @aether/auth · Better-Auth 实例工厂
// 封装 drizzle adapter + organization 插件接入，统一注入 Realm Tree 权限模型。
// 下游禁止直接依赖 better-auth，一律经本包创建实例。
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'

import { realmAccessControl, realmRoles } from './permissions.js'

export interface CreateAuthOptions {
  /** 已配置 schema 的 Drizzle pg 实例（含 @aether/auth schema 与 @aether/db schema）。 */
  db: Parameters<typeof drizzleAdapter>[0]
  baseURL: string
  secret?: string
  trustedOrigins?: string[]
  /** 透传给 betterAuth 的额外选项（如 emailAndPassword、socialProviders）。 */
  options?: Omit<BetterAuthOptions, 'database' | 'baseURL' | 'secret' | 'trustedOrigins' | 'plugins'>
}

export function createAuth(options: CreateAuthOptions) {
  const { db, baseURL, secret, trustedOrigins, options: extra } = options

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
    }),
    baseURL,
    secret,
    trustedOrigins,
    plugins: [
      organization({
        ac: realmAccessControl,
        roles: realmRoles,
        allowUserToCreateOrganization: false,
        creatorRole: 'owner',
        sendInvitationEmail: async () => {},
      }),
    ],
    ...extra,
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

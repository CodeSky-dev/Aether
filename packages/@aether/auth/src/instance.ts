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
        // eslint-disable-next-line @typescript-eslint/require-await
        sendInvitationEmail: async ({ email, organization, role }) => {
          // P3-29 修复：SSO/SCIM 落地前至少打日志，避免静默丢弃邀请
          // eslint-disable-next-line no-console
          console.log(
            `[auth] Invitation email (placeholder): to=${email} org=${organization.id} role=${role}`,
          )
        },
      }),
    ],
    ...extra,
  })
}
export type AuthInstance = ReturnType<typeof createAuth>

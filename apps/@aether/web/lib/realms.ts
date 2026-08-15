// @aether/web · Realm 列表与创建 Server Actions
'use server'

import { getDb } from '@/lib/db'
import { realms } from '@aether/db'
import { desc } from 'drizzle-orm'

export interface RealmRow {
  id: string
  slug: string
  name: string
  created_at: Date
}

/**
 * 列出所有 Realm，按创建时间降序。
 * M1 阶段无 auth 守卫，后续接入认证后可加 userId 过滤。
 */
export async function listRealms(): Promise<RealmRow[]> {
  const db = getDb()
  return db
    .select()
    .from(realms)
    .orderBy(desc(realms.created_at))
}

export interface CreateRealmInput {
  slug: string
  name: string
}

/**
 * 创建新 Realm。
 * auth_org_id / schema_namespace / residency 使用占位值；
 * 接入 Better-Auth organization 后替换为真实值。
 */
export async function createRealm(input: CreateRealmInput): Promise<{ id: string; slug: string; name: string }> {
  const db = getDb()
  const [realm] = await db
    .insert(realms)
    .values({
      slug: input.slug,
      name: input.name,
      auth_org_id: `org-placeholder-${Date.now()}`,
      schema_namespace: `ns_${input.slug}`,
      residency: 'vercel',
    })
    .returning({ id: realms.id, slug: realms.slug, name: realms.name })

  if (!realm) {
    throw new Error('Failed to create realm')
  }
  return realm
}

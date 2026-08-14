// @aether/converge-server · 数据库实例单例
// 与 @aether/web/lib/db.ts 同构：postgres-js + drizzle-orm/postgres-js。
// Hocuspocus Server 和 Server Actions 共享同一个 Postgres 数据源。
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@aether/db/schema'

let dbInstance: ReturnType<typeof createDrizzle> | null = null

function createDrizzle() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Converge server requires a Postgres connection.',
    )
  }
  // Hocuspocus 是长连接服务，连接池可适当放大。
  const queryClient = postgres(url, { max: 20 })
  return drizzle(queryClient, { schema })
}

/** 获取全局 drizzle 实例（懒初始化单例）。 */
export function getDb() {
  if (!dbInstance) {
    dbInstance = createDrizzle()
  }
  return dbInstance
}

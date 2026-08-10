// @aether/db · 数据层入口
// 导出 schema 与 Realm 隔离查询守卫。隔离是架构属性而非逐表追加条件：
// 业务代码一律经 realmScope 组织查询条件，禁止直接手工拼接 realm_id。
import { and, eq, type SQL } from 'drizzle-orm'

import * as schema from './schema.js'

export * from './schema.js'

export { schema }

/** 返回强制附带 realm_id 的组合条件（and(realmId=?, ...rest)）。 */
export function realmScope(
  realmId: string,
  ...rest: SQL[]
): SQL | undefined {
  const realmCond = eq(schema.realms.id, realmId)
  if (rest.length === 0) return realmCond
  return and(realmCond, ...rest)
}

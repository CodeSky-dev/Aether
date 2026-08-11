// @aether/db · 数据层入口
// 导出 schema 与 Realm 隔离查询守卫。隔离是架构属性而非逐表追加条件：
// 业务代码一律经 realmGuard/realmScope 组织查询条件，禁止直接手工拼接 realm_id。
export * from './schema.js'
export { schema } from './schema.js'
export { realmGuard, realmScope } from './guards.js'

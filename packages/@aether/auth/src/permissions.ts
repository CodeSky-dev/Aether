// @aether/auth · Realm Tree 三级权限模型
// statements 覆盖 Aether 领域资源；角色继承 organization 插件默认 owner/admin/member
// 并扩展为 Realm > Project > Member 三级嵌套语义。角色名存库（机器可读）用术语。
import { createAccessControl } from 'better-auth/plugins/access'

export const realmStatements = {
  realm: ['read', 'update', 'delete', 'manage_member'],
  project: ['create', 'read', 'update', 'delete'],
  thread: ['create', 'read', 'update', 'resolve', 'archive'],
  entity: ['read', 'create', 'update'],
  current: ['read', 'converge', 'drift'],
  audit: ['read'],
} as const

export const realmAccessControl = createAccessControl(realmStatements)

export const realmOwnerRole = realmAccessControl.newRole({
  realm: ['read', 'update', 'delete', 'manage_member'],
  project: ['create', 'read', 'update', 'delete'],
  thread: ['create', 'read', 'update', 'resolve', 'archive'],
  entity: ['read', 'create', 'update'],
  current: ['read', 'converge', 'drift'],
  audit: ['read'],
})

export const realmAdminRole = realmAccessControl.newRole({
  realm: ['read', 'update', 'manage_member'],
  project: ['create', 'read', 'update', 'delete'],
  thread: ['create', 'read', 'update', 'resolve', 'archive'],
  entity: ['read', 'create', 'update'],
  current: ['read', 'converge', 'drift'],
  audit: ['read'],
})

export const realmMemberRole = realmAccessControl.newRole({
  realm: ['read'],
  project: ['read'],
  thread: ['create', 'read', 'update'],
  entity: ['read'],
  current: ['read', 'converge', 'drift'],
  audit: [],
})

export const realmRoles = {
  owner: realmOwnerRole,
  admin: realmAdminRole,
  member: realmMemberRole,
}

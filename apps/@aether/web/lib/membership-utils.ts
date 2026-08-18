// @aether/web · 占位 organization 判断；独立于 `'use server'` 模块以提供同步复用辅助函数。
export function isPlaceholderOrganization(organizationId: string): boolean {
  return organizationId.startsWith('org-placeholder-')
}

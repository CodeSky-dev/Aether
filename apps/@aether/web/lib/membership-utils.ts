export function isPlaceholderOrganization(organizationId: string): boolean {
  return organizationId.startsWith('org-placeholder-')
}

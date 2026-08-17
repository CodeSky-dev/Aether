// @aether/web · /realms/[id]/audit 页面：审计记录列表
import { listAuditLogs } from '@/lib/audit'
import { listRealms } from '@/lib/realms'
import AuditLogList from '@/components/audit-log-list'
import NavShell from '@/components/nav-shell'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
const INITIAL_PAGE_SIZE = 50
interface PageProps {
  params: Promise<{ id: string }>
}
export default async function AuditPage({ params }: PageProps) {
  const { id: realmId } = await params
  const [logs, realms] = await Promise.all([
    // P1-7 修复：初始只取一页，后续由客户端"加载更多"
    listAuditLogs({ realmId, limit: INITIAL_PAGE_SIZE }),
    listRealms(),
  ])
  const realm = realms.find((r) => r.id === realmId)
  if (!realm) notFound()
  return (
    // P1-4 修复：传入 currentRealmId，使 Sidebar 在审计页也能渲染
    <NavShell currentRealmName={realm.name} currentRealmId={realm.id}>
      <div className="max-w-3xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-copy-18 font-medium text-neutral-9">Audit Vault</h1>
          <p className="mt-1 text-copy-13 text-neutral-5">
            {realm.name} 的所有操作审计记录（人 + Entity）
          </p>
        </div>
        <AuditLogList realmId={realmId} initialLogs={logs} />
      </div>
    </NavShell>
  )
}

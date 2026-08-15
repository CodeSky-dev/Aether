// @aether/web · /realms/[id]/audit 页面：审计记录列表
import { listAuditLogs } from '@/lib/audit'
import { listRealms } from '@/lib/realms'
import AuditRowItem from '@/components/audit-row'
import NavShell from '@/components/nav-shell'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AuditPage({ params }: PageProps) {
  const { id: realmId } = await params
  const [logs, realms] = await Promise.all([
    listAuditLogs({ realmId }),
    listRealms(),
  ])

  const realm = realms.find((r) => r.id === realmId)
  if (!realm) notFound()

  return (
    <NavShell currentRealmName={realm.name}>
      <div className="max-w-3xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-copy-18 font-medium text-neutral-9">Audit Vault</h1>
          <p className="mt-1 text-copy-13 text-neutral-5">
            {realm.name} 的所有操作审计记录（人 + Entity）
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-neutral-1 p-6 text-center">
            <p className="text-copy-14 text-neutral-6">暂无审计记录</p>
            <p className="mt-1 text-copy-12 text-neutral-4">操作写入后将在此显示。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <AuditRowItem key={log.id} row={log} />
            ))}
          </div>
        )}
      </div>
    </NavShell>
  )
}

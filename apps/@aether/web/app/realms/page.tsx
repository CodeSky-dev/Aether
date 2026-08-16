// @aether/web · /realms 页面：Realm 列表与创建表单
import { listRealms } from '@/lib/realms'
import RealmCard from '@/components/realm-card'
import NavShell from '@/components/nav-shell'
import CreateRealmForm from '@/components/create-realm-form'

export const dynamic = 'force-dynamic'

export default async function RealmsPage() {
  const realms = await listRealms()

  return (
    <NavShell>
      <div className="max-w-2xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-copy-18 font-medium text-neutral-9">Realms</h1>
            <p className="mt-1 text-copy-13 text-neutral-5">
              选择或创建一个新的 Realm 来开始工作。
            </p>
          </div>
          <CreateRealmForm />
        </div>

        {realms.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {realms.map((r) => (
              <RealmCard key={r.id} realm={r} />
            ))}
          </div>
        )}
      </div>
    </NavShell>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-neutral-1 p-8 text-center">
      <p className="text-copy-14 text-neutral-6">暂无 Realm</p>
      <p className="mt-1 text-copy-12 text-neutral-4">
        点击右上角「新建 Realm」开始创建第一个工作空间。
      </p>
    </div>
  )
}

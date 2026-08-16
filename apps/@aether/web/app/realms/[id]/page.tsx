// @aether/web · /realms/[id] 页面：Thread 列表 + Current 编辑器入口
import { listThreads } from '@/lib/threads'
import { listRealms } from '@/lib/realms'
import ThreadItem from '@/components/thread-item'
import NavShell from '@/components/nav-shell'
import CurrentEditor from '@/components/current-editor'
import CreateThreadForm from '@/components/create-thread-form'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RealmPage({ params }: PageProps) {
  const { id: realmId } = await params
  const [threads, realms] = await Promise.all([
    listThreads(realmId),
    listRealms(),
  ])

  const realm = realms.find((r) => r.id === realmId)
  if (!realm) notFound()

  return (
    <NavShell currentRealmName={realm.name} currentRealmId={realm.id}>
      <div className="max-w-3xl px-6 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-copy-18 font-medium text-neutral-9">{realm.name}</h1>
            <p className="mt-1 text-copy-13 text-neutral-5">
              slug: <span className="font-mono text-neutral-6">{realm.slug}</span>
            </p>
          </div>
          <CreateThreadForm realmId={realmId} />
        </div>

        {threads.length === 0 ? (
          <EmptyThreads />
        ) : (
          <div className="flex flex-col gap-2">
            {threads.map((t) => (
              <ThreadItem key={t.id} thread={t} />
            ))}
          </div>
        )}

        <hr className="my-8 border-border" />

        <h2 className="text-copy-16 font-medium text-neutral-9">快速编辑（Current）</h2>
        <p className="mt-1 text-copy-12 text-neutral-5">
          为当前 Realm 开启一个内联协同编辑器，可直接写入变更并看到其他实体的光标。
        </p>
        <div className="mt-4">
          <CurrentEditor realmId={realmId} threadId={`quick-${realmId}`} />
        </div>
      </div>
    </NavShell>
  )
}

function EmptyThreads() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-neutral-1 p-6 text-center">
      <p className="text-copy-14 text-neutral-6">此 Realm 暂无 Thread</p>
      <p className="mt-1 text-copy-12 text-neutral-4">点击右上角「新建 Thread」开始。</p>
    </div>
  )
}

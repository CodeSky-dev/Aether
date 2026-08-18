// @aether/web · /realms/[id] 页面：Thread 列表 + Current 编辑器入口
// Yohaku：eyebrow 承载 slug，serif H1 承载名称；区块间距用 mt-16 而非 hr 分隔。
import { listThreads } from '@/lib/threads'
import { listRealms } from '@/lib/realms'
import ThreadList from '@/components/thread-list'
import NavShell from '@/components/nav-shell'
import PageHeader from '@/components/page-header'
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
      <div className="mx-auto max-w-3xl px-6 py-12 md:px-8">
        <PageHeader
          eyebrow={realm.slug}
          title={realm.name}
          description="Thread 是 Context-Bound 的叙事单元；点击可在原位展开 Current 协同编辑。"
        />

        <section className="mb-12 rounded-lg bg-neutral-1 p-5 ring-1 ring-border">
          <p className="text-caption-10 uppercase tracking-[1.5px] text-neutral-6">
            新建 Thread
          </p>
          <CreateThreadForm realmId={realmId} />
        </section>

        {/* P0-3 修复：ThreadList 内部管理选中状态，点击 Thread 内联展开 CurrentEditor */}
        <ThreadList threads={threads} realmId={realmId} />

        <section className="mt-16">
          <h2 className="font-serif text-title-20 font-medium text-neutral-9">
            快速编辑 · Current
          </h2>
          <p className="mt-2 text-copy-13 text-neutral-7">
            为当前 Realm 开启一个内联协同编辑器，可直接写入变更并看到其他实体的光标。
          </p>
          <div className="mt-5 rounded-lg bg-neutral-1 p-5 ring-1 ring-border">
            <CurrentEditor realmId={realmId} threadId={`quick-${realmId}`} />
          </div>
        </section>
      </div>
    </NavShell>
  )
}

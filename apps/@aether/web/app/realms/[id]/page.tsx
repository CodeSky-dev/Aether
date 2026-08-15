// @aether/web · /realms/[id] 页面：Thread 列表 + Current 编辑器入口
import { listThreads, createThread } from '@/lib/threads'
import { listRealms } from '@/lib/realms'
import ThreadItem from '@/components/thread-item'
import NavShell from '@/components/nav-shell'
import CurrentEditor from '@/components/current-editor'
import { notFound } from 'next/navigation'
import { useState } from 'react'

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
          为当前 Realm 开启一个内联协同编辑器，可直接写入变更。
        </p>
        <div className="mt-4">
          <CurrentEditor realmId={realmId} threadId={`quick-${realmId}`} />
        </div>
      </div>
    </NavShell>
  )
}

function CreateThreadForm({ realmId }: { realmId: string }) {
  'use client'
  const [title, setTitle] = useState('')
  const [manifestationUrl, setManifestationUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await createThread({
        realmId,
        projectId: `proj-${realmId}`,
        title: title.trim(),
        ...(manifestationUrl.trim() ? { manifestationUrl: manifestationUrl.trim() } : {}),
      })
      setTitle('')
      setManifestationUrl('')
      setTimeout(() => window.location.reload(), 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-2 w-80">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Thread 标题…"
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-13 text-neutral-9 outline-none placeholder-neutral-4 focus:border-accent/50"
        required
      />
      <input
        value={manifestationUrl}
        onChange={(e) => setManifestationUrl(e.target.value)}
        placeholder="Manifestation URL（可选）"
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-12 text-neutral-7 outline-none placeholder-neutral-4 focus:border-accent/50"
      />
      <button
        type="submit"
        disabled={submitting}
        className="self-end rounded-md bg-accent px-3 py-1.5 text-copy-13 font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? '创建中…' : '新建 Thread'}
      </button>
      {error && <p className="text-copy-11 text-red-600">{error}</p>}
    </form>
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

// @aether/web · /realms 页面：Realm 列表与创建表单
import { listRealms, createRealm } from '@/lib/realms'
import RealmCard from '@/components/realm-card'
import NavShell from '@/components/nav-shell'
import { useState } from 'react'

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

function CreateRealmForm() {
  'use client'
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!slug.trim() || !name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await createRealm({ slug: slug.trim(), name: name.trim() })
      setCreated(result.id)
      setSlug('')
      setName('')
      setTimeout(() => window.location.reload(), 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex w-72 flex-col gap-2">
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug（如：my-project）"
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-13 text-neutral-9 outline-none placeholder-neutral-4 focus:border-accent/50"
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称（如：My Project）"
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-13 text-neutral-9 outline-none placeholder-neutral-4 focus:border-accent/50"
        required
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-accent px-3 py-1.5 text-copy-13 font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? '创建中…' : '新建 Realm'}
      </button>
      {error && <p className="text-copy-11 text-red-600">{error}</p>}
      {created && (
        <p className="text-copy-11 text-emerald-600">创建成功！</p>
      )}
    </form>
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

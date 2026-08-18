// @aether/web · 新建 Realm 表单（Client Component）
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRealm } from '@/lib/realms'
export default function CreateRealmForm() {
  const router = useRouter()
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
      // P2-10 修复：使用 router.refresh() 替代 window.location.reload()
      router.refresh()
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
      {error && <p className="text-label-12 text-red-600">{error}</p>}
      {created && (
        <p className="text-label-12 text-emerald-600">创建成功！</p>
      )}
    </form>
  )
}

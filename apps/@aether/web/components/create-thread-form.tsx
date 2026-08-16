// @aether/web · 新建 Thread 表单（Client Component）
'use client'

import { useState } from 'react'
import { createThread } from '@/lib/threads'

interface CreateThreadFormProps {
  realmId: string
}

export default function CreateThreadForm({ realmId }: CreateThreadFormProps) {
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
    <form onSubmit={(e) => { void handleSubmit(e) }} className="flex w-80 flex-col gap-2">
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

// @aether/web · 新建 Thread 表单（Client Component）
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createThread, listProjects } from '@/lib/threads'
interface CreateThreadFormProps {
  realmId: string
}
export default function CreateThreadForm({ realmId }: CreateThreadFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [manifestationUrl, setManifestationUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // P0-2 修复：加载真实 project 列表，不再使用硬编码占位值
  useEffect(() => {
    let cancelled = false
    listProjects(realmId)
      .then((list) => {
        if (cancelled) return
        setProjects(list)
        if (list.length > 0) {
          setProjectId(list[0]!.id)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })
    return () => { cancelled = true }
  }, [realmId])
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    if (!projectId) {
      setError('请先选择 Project（当前 Realm 无可用 Project）')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createThread({
        realmId,
        projectId,
        title: title.trim(),
        ...(manifestationUrl.trim() ? { manifestationUrl: manifestationUrl.trim() } : {}),
      })
      setTitle('')
      setManifestationUrl('')
      // P2-10 修复：使用 router.refresh() 替代 window.location.reload()
      router.refresh()
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
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        disabled={loadingProjects || projects.length === 0}
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-13 text-neutral-9 outline-none focus:border-accent/50 disabled:opacity-50"
      >
        {loadingProjects ? (
          <option value="">加载 Project…</option>
        ) : projects.length === 0 ? (
          <option value="">无可用 Project</option>
        ) : (
          projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
          ))
        )}
      </select>
      <input
        value={manifestationUrl}
        onChange={(e) => setManifestationUrl(e.target.value)}
        placeholder="Manifestation URL（可选）"
        className="rounded-md border border-border bg-neutral-1 px-3 py-1.5 text-copy-12 text-neutral-7 outline-none placeholder-neutral-4 focus:border-accent/50"
      />
      <button
        type="submit"
        disabled={submitting || projects.length === 0}
        className="self-end rounded-md bg-accent px-3 py-1.5 text-copy-13 font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? '创建中…' : '新建 Thread'}
      </button>
      {error && <p className="text-copy-11 text-red-600">{error}</p>}
    </form>
  )
}

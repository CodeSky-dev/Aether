// @aether/web · 新建 Thread 表单（Client Component）
// Yohaku：.field 统一控件，语义色只表达状态，按钮右对齐保持视觉重量平衡。
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
    <form onSubmit={(e) => { void handleSubmit(e) }} className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread 标题…"
          className="field min-w-52 flex-[2]"
          required
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={loadingProjects || projects.length === 0}
          className="field min-w-44 flex-1"
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
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <input
          value={manifestationUrl}
          onChange={(e) => setManifestationUrl(e.target.value)}
          placeholder="Manifestation URL（可选，绑定 Vercel Preview）"
          className="field min-w-52 flex-[2]"
        />
        <button
          type="submit"
          disabled={submitting || projects.length === 0}
          className="btn-primary flex-1 sm:flex-none"
        >
          {submitting ? '创建中…' : '新建 Thread'}
        </button>
      </div>
      {error && <p className="text-label-12 text-error">{error}</p>}
    </form>
  )
}

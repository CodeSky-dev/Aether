// @aether/web · 新建 Realm 表单（Client Component）
// Yohaku：单行紧凑布局，.field 统一控件形态，语义色只表达状态。
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
    <form onSubmit={(e) => { void handleSubmit(e) }} className="mt-3 flex flex-wrap items-start gap-2">
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug（如：my-project）"
        className="field min-w-44 flex-1"
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称（如：My Project）"
        className="field min-w-44 flex-1"
        required
      />
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? '创建中…' : '新建 Realm'}
      </button>
      {error && <p className="w-full text-label-12 text-error">{error}</p>}
      {created && (
        <p className="w-full text-label-12 text-success">创建成功！</p>
      )}
    </form>
  )
}

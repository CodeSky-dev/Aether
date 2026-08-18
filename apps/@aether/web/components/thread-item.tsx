// @aether/web · Thread 行组件
// Yohaku：状态用语义色淡底 chip 表达，标题 copy-15 承担层级，元数据一律 n-6。
'use client'
import Link from 'next/link'
import { type ThreadRow } from '@/lib/threads'
interface ThreadItemProps {
  thread: ThreadRow
  /** P0-3 修复：点击 Thread 时在同页内联展开 CurrentEditor，而非跳转到不存在的路由 */
  onSelect?: (threadId: string) => void
  selected?: boolean
}
const STATUS_CONFIG = {
  open: { label: '开放', color: 'bg-accent/10 text-accent' },
  in_review: { label: '评审中', color: 'bg-warning/10 text-warning' },
  resolved: { label: '已解决', color: 'bg-success/10 text-success' },
  archived: { label: '已归档', color: 'bg-neutral-3 text-neutral-6' },
} as const
type StatusKey = keyof typeof STATUS_CONFIG
function getStatusConfig(status: string): (typeof STATUS_CONFIG)[StatusKey] {
  const found = STATUS_CONFIG[status as StatusKey]
  return found ?? STATUS_CONFIG.open
}
export default function ThreadItem({ thread, onSelect, selected }: ThreadItemProps) {
  const config = getStatusConfig(thread.status ?? 'open')
  const hasManifestation = Boolean(thread.manifestation_url)
  // 有 Manifestation URL 时仍使用外部链接打开
  if (hasManifestation) {
    return (
      <Link
        href={thread.manifestation_url!}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg bg-neutral-1 p-4 ring-1 ring-border transition hover:bg-neutral-2 hover:ring-accent/30"
      >
        <ThreadContent thread={thread} config={config} hasManifestation />
      </Link>
    )
  }
  // P0-3 修复：无 Manifestation 时点击内联展开编辑器，不再跳转 /realms/[id]/current/[threadId]
  return (
    <button
      type="button"
      onClick={() => onSelect?.(thread.id)}
      className={`block w-full rounded-lg p-4 text-left ring-1 transition ${
        selected
          ? 'bg-accent/5 ring-accent/40'
          : 'bg-neutral-1 ring-border hover:bg-neutral-2 hover:ring-accent/30'
      }`}
    >
      <ThreadContent thread={thread} config={config} hasManifestation={false} />
    </button>
  )
}
function ThreadContent({
  thread,
  config,
  hasManifestation,
}: {
  thread: ThreadRow
  config: (typeof STATUS_CONFIG)[StatusKey]
  hasManifestation: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="min-w-0 truncate font-serif text-copy-15 font-medium text-neutral-9">
          {thread.title}
        </span>
        <span className={`shrink-0 rounded px-2 py-0.5 text-label-12 ${config.color}`}>
          {config.label}
        </span>
        {hasManifestation && (
          <span className="shrink-0 rounded bg-success/10 px-2 py-0.5 text-label-12 text-success">
            Live
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 truncate font-mono text-label-12 text-neutral-6">
          {thread.project_id}
          {hasManifestation && (
            <span className="ml-2 font-sans text-neutral-6">· 预览已绑定</span>
          )}
        </p>
        <span className="shrink-0 text-label-12 text-neutral-6">
          {new Date(thread.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>
    </>
  )
}

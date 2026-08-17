// @aether/web · Thread 行组件
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
  open: { label: '开放', color: 'bg-accent/20 text-accent' },
  in_review: { label: '评审中', color: 'text-warning' },
  resolved: { label: '已解决', color: 'text-success' },
  archived: { label: '已归档', color: 'bg-neutral-3 text-neutral-5' },
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
        className="flex items-center gap-4 rounded-lg border border-border bg-neutral-1 p-3 transition hover:border-neutral-3 hover:ring-1 hover:ring-accent/20"
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
      className={`flex w-full items-center gap-4 rounded-lg border p-3 text-left transition hover:border-neutral-3 hover:ring-1 hover:ring-accent/20 ${
        selected ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/20' : 'border-border bg-neutral-1'
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
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-copy-13 font-medium text-neutral-9">{thread.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-label-12 ${config.color}`}>
            {config.label}
          </span>
          {hasManifestation && (
            <span className="rounded-full px-2 py-0.5 text-label-12 text-success">
              Live
            </span>
          )}
        </div>
        <p className="mt-0.5 text-label-12 text-neutral-5">
          project: <span className="font-mono text-neutral-6">{thread.project_id}</span>
          {hasManifestation && (
            <span className="ml-2 text-neutral-4">· 预览已绑定</span>
          )}
        </p>
      </div>
      <span className="text-label-12 text-neutral-4 shrink-0">
        {new Date(thread.created_at).toLocaleDateString('zh-CN')}
      </span>
    </>
  )
}

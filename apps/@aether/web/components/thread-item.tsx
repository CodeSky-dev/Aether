// @aether/web · Thread 行组件
'use client'

import Link from 'next/link'
import { type ThreadRow } from '@/lib/threads'

interface ThreadItemProps {
  thread: ThreadRow
}

export default function ThreadItem({ thread }: ThreadItemProps) {
  const statusColor =
    thread.status === 'open' ? 'bg-accent/20 text-accent'
    : thread.status === 'closed' ? 'bg-neutral-300/30 text-neutral-5'
    : 'bg-neutral-200/30 text-neutral-5'

  const hasManifestation = Boolean(thread.manifestation_url)

  return (
    <Link
      href={hasManifestation ? thread.manifestation_url! : `/realms/${thread.realm_id}/current/${thread.id}`}
      target={hasManifestation ? '_blank' : undefined}
      rel={hasManifestation ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-4 rounded-lg border border-border bg-neutral-1 p-3 transition hover:border-neutral-3 hover:shadow-sm"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-copy-13 font-medium text-neutral-9">{thread.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-copy-10 ${statusColor}`}>
            {thread.status ?? 'open'}
          </span>
          {hasManifestation && (
            <span className="rounded-full px-2 py-0.5 text-copy-10 bg-emerald-100/20 text-emerald-600">
              Live
            </span>
          )}
        </div>
        <p className="mt-0.5 text-copy-11 text-neutral-5">
          project: <span className="font-mono text-neutral-6">{thread.project_id}</span>
          {hasManifestation && (
            <span className="ml-2 text-neutral-4">· 预览已绑定</span>
          )}
        </p>
      </div>
      <span className="text-copy-11 text-neutral-4 shrink-0">
        {new Date(thread.created_at).toLocaleDateString('zh-CN')}
      </span>
    </Link>
  )
}

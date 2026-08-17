// @aether/web · Thread 列表 + 内联 CurrentEditor（客户端组件）
// P0-3 修复：点击 Thread 在同页内联展开编辑器，而非跳转到不存在的路由
'use client'
import { useState } from 'react'
import ThreadItem from '@/components/thread-item'
import CurrentEditor from '@/components/current-editor'
import type { ThreadRow } from '@/lib/threads'
interface ThreadListProps {
  threads: ThreadRow[]
  realmId: string
}
export default function ThreadList({ threads, realmId }: ThreadListProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-neutral-1 p-6 text-center">
        <p className="text-copy-14 text-neutral-6">此 Realm 暂无 Thread</p>
        <p className="mt-1 text-copy-12 text-neutral-4">点击右上角「新建 Thread」开始。</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {threads.map((t) => (
        <ThreadItem
          key={t.id}
          thread={t}
          selected={t.id === selectedThreadId}
          onSelect={(threadId) => {
            setSelectedThreadId((prev) => (prev === threadId ? null : threadId))
          }}
        />
      ))}
      {selectedThread && (
        <div className="mt-2 rounded-lg border border-accent/30 bg-neutral-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-copy-14 font-medium text-neutral-8">
              正在编辑：{selectedThread.title}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedThreadId(null)}
              className="text-copy-12 text-neutral-5 transition hover:text-neutral-7"
            >
              收起
            </button>
          </div>
          <CurrentEditor realmId={realmId} threadId={selectedThread.id} />
        </div>
      )}
    </div>
  )
}

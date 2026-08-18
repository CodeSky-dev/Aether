// @aether/web · Thread 列表 + 内联 CurrentEditor（客户端组件）
// P0-3 修复：点击 Thread 在同页内联展开编辑器，而非跳转到不存在的路由
// Yohaku：编辑面板以 accent 淡 ring 标示"正在进行"，其余保持中性。
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
      <div className="rounded-lg border border-dashed border-border bg-neutral-1 px-6 py-16 text-center">
        <p className="text-copy-14 text-neutral-7">此 Realm 暂无 Thread</p>
        <p className="mt-2 text-label-12 text-neutral-6">
          在上方面板创建第一个 Thread，开始一段上下文绑定的叙事。
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
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
        <div className="mt-3 rounded-lg bg-neutral-1 p-5 ring-1 ring-accent/25">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-caption-10 uppercase tracking-[1.5px] text-accent">
                Current · 正在编辑
              </p>
              <h3 className="mt-1 truncate font-serif text-copy-15 font-medium text-neutral-9">
                {selectedThread.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedThreadId(null)}
              className="shrink-0 text-label-12 text-neutral-6 transition hover:text-neutral-9"
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

// @aether/web · Realm 卡片组件
// Yohaku：serif 名称承担层级，slug 用 chip，ID 截断为 mono 指纹，hover 只换 ring。
'use client'

import Link from 'next/link'
import { type RealmRow } from '@/lib/realms'

interface RealmCardProps {
  realm: RealmRow
}

/** 长 ID 截断为可读指纹（完整值挂 title 提示） */
function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…`
}

export default function RealmCard({ realm }: RealmCardProps) {
  return (
    <Link
      href={`/realms/${realm.id}`}
      className="group flex h-full flex-col rounded-lg bg-neutral-1 p-5 ring-1 ring-border transition hover:bg-neutral-2 hover:ring-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate font-serif text-copy-16 font-medium text-neutral-9">
          {realm.name}
        </h3>
        <span className="shrink-0 rounded bg-neutral-2 px-1.5 py-0.5 font-mono text-label-12 text-neutral-6 transition group-hover:bg-neutral-3">
          {realm.slug}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-8">
        <span
          className="truncate font-mono text-label-12 text-neutral-6"
          title={realm.id}
        >
          {shortId(realm.id)}
        </span>
        <span className="shrink-0 text-label-12 text-neutral-6">
          {new Date(realm.created_at).toLocaleDateString('zh-CN')}
        </span>
      </div>
    </Link>
  )
}

// @aether/web · Realm 卡片组件
'use client'

import Link from 'next/link'
import { type RealmRow } from '@/lib/realms'

interface RealmCardProps {
  realm: RealmRow
}

export default function RealmCard({ realm }: RealmCardProps) {
  return (
    <Link
      href={`/realms/${realm.id}`}
      className="block rounded-lg border border-border bg-neutral-1 p-4 transition hover:border-neutral-3 hover:ring-1 hover:ring-accent/20"
    >
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-copy-14 font-medium text-neutral-9">{realm.name}</h3>
        <span className="text-label-12 text-neutral-4">· {realm.slug}</span>
      </div>
      <p className="text-label-12 text-neutral-5">
        ID: <span className="font-mono text-neutral-6">{realm.id}</span>
      </p>
      <p className="mt-2 text-label-12 text-neutral-4">
        {new Date(realm.created_at).toLocaleDateString('zh-CN')}
      </p>
    </Link>
  )
}

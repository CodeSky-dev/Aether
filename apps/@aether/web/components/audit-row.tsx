// @aether/web · 审计行组件
'use client'

import { type AuditRow } from '@/lib/audit'

const actionLabel: Record<string, string> = {
  read: '读取',
  write: '写入',
  delete: '删除',
  audit: '审计记录',
  entity_create: '创建 Entity',
  entity_update: '更新 Entity',
  entity_delete: '删除 Entity',
  handoff_request: '发起交接',
  handoff_accept: '接受交接',
  handoff_reject: '拒绝交接',
  handoff_revoke: '撤销交接',
  auth_login: '登录',
  auth_logout: '登出',
  auth_register: '注册',
  schema_migration: 'Schema 迁移',
  presence_join: '加入 Presence',
  presence_leave: '离开 Presence',
}

function actorTypeLabel(type: string): string {
  return type === 'human' ? '人' : 'Entity'
}

function formatTimestamp(ts: Date | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface AuditRowProps {
  row: AuditRow
}

export default function AuditRowItem({ row }: AuditRowProps) {
  const label = actionLabel[row.action] ?? row.action
  const target = row.doc_ref ?? row.entity_id ?? ''
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-neutral-1 px-3 py-2 text-copy-12">
      <span className="shrink-0 rounded px-1.5 py-0.5 text-copy-11 bg-neutral-200/30 text-neutral-6">
        {actorTypeLabel(row.actor_type)}
      </span>
      <span className="shrink-0 font-mono text-neutral-8">{label}</span>
      <span className="min-w-0 flex-1 truncate text-neutral-5">{target || '—'}</span>
      <span className="shrink-0 text-neutral-4">
        {formatTimestamp(row.created_at)}
      </span>
    </div>
  )
}

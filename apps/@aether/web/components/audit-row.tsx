// @aether/web · 审计行组件
'use client'
import { type AuditRow } from '@/lib/audit'
const actionLabel: Record<string, string> = {
  read: '读取',
  write: '写入',
  permission_change: '权限变更',
  converse: '对话',
  execute: '执行',
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
/** 截断长 hash 用于展示 */
function shortHash(hash: string): string {
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}
interface AuditRowProps {
  row: AuditRow
}
export default function AuditRowItem({ row }: AuditRowProps) {
  const label = actionLabel[row.action] ?? row.action
  const target = row.doc_ref ?? row.entity_id ?? ''
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-neutral-1 px-3 py-2 text-label-12">
      <div className="flex items-center gap-4">
        <span className="shrink-0 rounded px-1.5 py-0.5 text-label-12 bg-neutral-2 text-neutral-7">
          {actorTypeLabel(row.actor_type)}
        </span>
        <span className="shrink-0 font-mono text-neutral-8">{label}</span>
        {/* P3-22 修复：展示 actor_id，增强审计可追溯性 */}
        <span className="shrink-0 font-mono text-copy-10 text-neutral-4" title={row.actor_id}>
          {shortHash(row.actor_id)}
        </span>
        <span className="min-w-0 flex-1 truncate text-neutral-5">{target || '—'}</span>
        <span className="shrink-0 text-neutral-4">
          {formatTimestamp(row.created_at)}
        </span>
      </div>
      {/* P3-22 修复：展示 payload_hash（sha256），用于审计完整性校验 */}
      <div className="flex items-center gap-2 pl-1">
        <span className="text-copy-10 text-neutral-4">payload_hash:</span>
        <span className="font-mono text-copy-10 text-neutral-4" title={row.payload_hash}>
          {shortHash(row.payload_hash)}
        </span>
      </div>
    </div>
  )
}

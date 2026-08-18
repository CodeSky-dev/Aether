// @aether/web · 审计行组件
// Yohaku：hairline 台账行——人/Entity 以 chip 区分（Entity 用縹 hanada），等宽数字承载时间与指纹。
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
function actorTypeClass(type: string): string {
  return type === 'human'
    ? 'bg-neutral-2 text-neutral-7'
    : 'bg-info/10 text-info'
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
    <div className="flex flex-col gap-1 border-b border-border py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-label-12 ${actorTypeClass(row.actor_type)}`}
        >
          {actorTypeLabel(row.actor_type)}
        </span>
        <span className="shrink-0 text-copy-13 font-medium text-neutral-8">{label}</span>
        {/* P3-22 修复：展示 actor_id，增强审计可追溯性 */}
        <span
          className="shrink-0 font-mono text-label-12 text-neutral-6"
          title={row.actor_id}
        >
          {shortHash(row.actor_id)}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-label-12 text-neutral-6">
          {target || '—'}
        </span>
        <span className="shrink-0 font-mono text-label-12 text-neutral-6 tabular-nums">
          {formatTimestamp(row.created_at)}
        </span>
      </div>
      {/* P3-22 修复：展示 payload_hash（sha256），用于审计完整性校验 */}
      <div className="flex items-center gap-2 pl-0.5">
        <span className="text-label-12 text-neutral-6">payload</span>
        <span
          className="font-mono text-label-12 text-neutral-6"
          title={row.payload_hash}
        >
          {shortHash(row.payload_hash)}
        </span>
      </div>
    </div>
  )
}

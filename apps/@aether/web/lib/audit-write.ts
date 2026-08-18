// @aether/web · 内部审计写入辅助函数
import { createHash } from 'node:crypto'
import { auditLog } from '@aether/db'
import type { ActorType } from '@aether/types'
import type { getDb } from '@/lib/db'

type AuditTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>['transaction']>[0]
>[0]

interface RecordPermissionChangeInput {
  realmId: string
  actor: {
    actorType: ActorType
    actorId: string
  }
  target: Record<string, unknown>
  idempotencyKey: string
  result: Record<string, unknown>
}

export async function recordPermissionChange(
  tx: AuditTransaction,
  input: RecordPermissionChangeInput,
): Promise<void> {
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(input.target), 'utf8')
    .digest('hex')

  await tx.insert(auditLog).values({
    realm_id: input.realmId,
    actor_type: input.actor.actorType,
    actor_id: input.actor.actorId,
    action: 'permission_change',
    target: input.target,
    payload_hash: payloadHash,
    idempotency_key: input.idempotencyKey,
    result: input.result,
  })
}

// @aether/current-sync · 基础字段级 Converge Engine。
import type { ActorType, YDocPartitionKey } from '@aether/types'

export type ConvergeStrategy = 'crdt' | 'lww' | 'manual'

export interface FieldPolicy {
  partition: YDocPartitionKey
  fieldPath: string
  strategy: ConvergeStrategy
}

export interface EntityCommitOperation {
  realm_id: string
  actor_type: ActorType
  actor_id: string
  action?: 'write'
  idempotency_key: string
  payload_hash: string
  partition: YDocPartitionKey
  field_path: string
  value: unknown
  base_state_hash: string | null
  submitted_at?: number
}

export interface ConflictRecord {
  realm_id: string
  actor_type: ActorType
  actor_id: string
  action: 'write'
  target: {
    partition: YDocPartitionKey
    field_path: string
  }
  payload_hash: string
  idempotency_key: string
  result: {
    strategy: ConvergeStrategy
    reason: string
    accepted: boolean
    previous_state_hash: string | null
    incoming_state_hash: string
  }
  created_at: string
}

export interface ConvergeResult {
  accepted: boolean
  deduplicated: boolean
  strategy: ConvergeStrategy
  stateHash: string | null
  value: unknown
  conflict: ConflictRecord | null
}

interface StoredField {
  value: unknown
  stateHash: string
  committedAt: number
}

function stableSerialize(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`
}

function hashValue(value: unknown): string {
  const serialized = stableSerialize(value)
  let hash = 2_166_136_261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function fieldKey(partition: YDocPartitionKey, fieldPath: string): string {
  return `${partition}:${fieldPath}`
}

export interface ConvergeEngineOptions {
  realmId: string
  policies?: readonly FieldPolicy[]
  now?: () => number
}

export class ConvergeEngine {
  private readonly realmId: string
  private readonly policies = new Map<string, ConvergeStrategy>()
  private readonly fields = new Map<string, StoredField>()
  private readonly idempotency = new Map<string, ConvergeResult>()
  private readonly now: () => number

  public constructor(options: ConvergeEngineOptions) {
    this.realmId = options.realmId
    this.now = options.now ?? Date.now
    for (const policy of options.policies ?? []) {
      this.setPolicy(policy)
    }
  }

  public setPolicy(policy: FieldPolicy): void {
    if (policy.fieldPath.length === 0) {
      throw new Error('fieldPath cannot be empty')
    }
    this.policies.set(
      fieldKey(policy.partition, policy.fieldPath),
      policy.strategy,
    )
  }

  public getPolicy(
    partition: YDocPartitionKey,
    fieldPath: string,
  ): ConvergeStrategy {
    return this.policies.get(fieldKey(partition, fieldPath)) ?? 'crdt'
  }

  public getState(
    partition: YDocPartitionKey,
    fieldPath: string,
  ): unknown {
    return this.fields.get(fieldKey(partition, fieldPath))?.value
  }

  public getStateHash(
    partition: YDocPartitionKey,
    fieldPath: string,
  ): string | null {
    return this.fields.get(fieldKey(partition, fieldPath))?.stateHash ?? null
  }

  public commit(operation: EntityCommitOperation): ConvergeResult {
    if (operation.realm_id !== this.realmId) {
      throw new Error(
        `Realm mismatch: expected ${this.realmId}, received ${operation.realm_id}`,
      )
    }
    const previous = this.idempotency.get(operation.idempotency_key)
    if (previous) {
      return { ...previous, deduplicated: true }
    }

    const key = fieldKey(operation.partition, operation.field_path)
    const current = this.fields.get(key)
    const strategy = this.getPolicy(operation.partition, operation.field_path)
    const incomingStateHash = hashValue(operation.value)
    const previousStateHash = current?.stateHash ?? null
    const hasStaleBase = previousStateHash !== operation.base_state_hash
    const submittedAt = operation.submitted_at ?? this.now()
    let accepted = !hasStaleBase
    let conflict: ConflictRecord | null = null

    if (strategy === 'manual') {
      accepted = false
      conflict = this.createConflict(
        operation,
        strategy,
        'manual_review_required',
        accepted,
        previousStateHash,
        incomingStateHash,
      )
    } else if (hasStaleBase && strategy === 'lww') {
      accepted = !current || submittedAt >= current.committedAt
      conflict = this.createConflict(
        operation,
        strategy,
        accepted ? 'stale_base_overwritten' : 'stale_base_rejected',
        accepted,
        previousStateHash,
        incomingStateHash,
      )
    } else if (strategy === 'crdt') {
      accepted = true
    }

    if (accepted) {
      this.fields.set(key, {
        value: operation.value,
        stateHash: incomingStateHash,
        committedAt: submittedAt,
      })
    }

    const result: ConvergeResult = {
      accepted,
      deduplicated: false,
      strategy,
      stateHash: accepted ? incomingStateHash : previousStateHash,
      value: accepted ? operation.value : current?.value,
      conflict,
    }
    this.idempotency.set(operation.idempotency_key, result)
    return result
  }

  private createConflict(
    operation: EntityCommitOperation,
    strategy: ConvergeStrategy,
    reason: string,
    accepted: boolean,
    previousStateHash: string | null,
    incomingStateHash: string,
  ): ConflictRecord {
    return {
      realm_id: operation.realm_id,
      actor_type: operation.actor_type,
      actor_id: operation.actor_id,
      action: operation.action ?? 'write',
      target: {
        partition: operation.partition,
        field_path: operation.field_path,
      },
      payload_hash: operation.payload_hash,
      idempotency_key: operation.idempotency_key,
      result: {
        strategy,
        reason,
        accepted,
        previous_state_hash: previousStateHash,
        incoming_state_hash: incomingStateHash,
      },
      created_at: new Date(this.now()).toISOString(),
    }
  }
}

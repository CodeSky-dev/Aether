// @aether/current-sync · 基础字段级 Converge Engine。
import type { ActorType, YDocPartitionKey } from '@aether/types'
import type { RealmChannel } from './realm-channel.js'

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

export type StateHashFunction = (value: unknown) => string

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

// 非加密用途的基线实现；生产环境可通过 hashValue 注入更强哈希。
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
  channel: RealmChannel
  policies?: readonly FieldPolicy[]
  now?: () => number
  hashValue?: StateHashFunction
  maxIdempotencyEntries?: number
}

export class ConvergeEngine {
  private readonly realmId: string
  private readonly channel: RealmChannel
  private readonly policies = new Map<string, ConvergeStrategy>()
  private readonly idempotency = new Map<string, ConvergeResult>()
  private readonly now: () => number
  private readonly hashValue: StateHashFunction
  private readonly maxIdempotencyEntries: number

  public constructor(options: ConvergeEngineOptions) {
    if (options.channel.realmId !== options.realmId) {
      throw new Error(
        `Realm mismatch: expected ${options.realmId}, received ${options.channel.realmId}`,
      )
    }
    if (
      options.maxIdempotencyEntries !== undefined &&
      (!Number.isInteger(options.maxIdempotencyEntries) ||
        options.maxIdempotencyEntries < 1)
    ) {
      throw new Error('maxIdempotencyEntries must be a positive integer')
    }
    this.realmId = options.realmId
    this.channel = options.channel
    this.now = options.now ?? Date.now
    this.hashValue = options.hashValue ?? hashValue
    this.maxIdempotencyEntries = options.maxIdempotencyEntries ?? 1000
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
    return this.channel.readField(partition, fieldPath)
  }

  public getStateHash(
    partition: YDocPartitionKey,
    fieldPath: string,
  ): string | null {
    const value = this.getState(partition, fieldPath)
    return value === undefined ? null : this.hashValue(value)
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

    const strategy = this.getPolicy(operation.partition, operation.field_path)
    const currentValue = this.getState(
      operation.partition,
      operation.field_path,
    )
    const incomingStateHash = this.hashValue(operation.value)
    const previousStateHash =
      currentValue === undefined ? null : this.hashValue(currentValue)
    const hasStaleBase = previousStateHash !== operation.base_state_hash
    const submittedAt = operation.submitted_at ?? this.now()
    const currentCommittedAt = this.channel.readFieldCommittedAt(
      operation.partition,
      operation.field_path,
    )
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
      accepted =
        currentCommittedAt === null || submittedAt >= currentCommittedAt
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
      this.channel.writeField(
        operation.partition,
        operation.field_path,
        operation.value,
      )
      this.channel.writeFieldCommittedAt(
        operation.partition,
        operation.field_path,
        submittedAt,
      )
    }

    const result: ConvergeResult = {
      accepted,
      deduplicated: false,
      strategy,
      stateHash: accepted ? incomingStateHash : previousStateHash,
      value: accepted ? operation.value : currentValue,
      conflict,
    }
    this.idempotency.set(operation.idempotency_key, result)
    this.evictOldestIdempotencyEntry()
    return result
  }

  private evictOldestIdempotencyEntry(): void {
    while (this.idempotency.size > this.maxIdempotencyEntries) {
      const oldestKey = this.idempotency.keys().next().value
      if (typeof oldestKey !== 'string') {
        return
      }
      this.idempotency.delete(oldestKey)
    }
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

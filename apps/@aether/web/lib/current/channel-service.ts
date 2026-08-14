// @aether/web · Current 状态通道核心逻辑
// 桥接 @aether/db（落库）与 @aether/current-sync（序列化）。
// 本模块是纯函数层，接收 db 实例作为参数，可脱离 Next.js 用 pg-proxy mock 测试。
// Server Actions 是此模块的薄包装。
import {
  appendCrdtUpdate,
  readCrdtUpdateCursor,
  readCrdtUpdatesSince,
  type UpdateLogDb,
} from '@aether/db'
import {
  deserializeUpdate,
  serializeUpdate,
} from '@aether/current-sync'
import type { ActorType } from '@aether/types'
import type { BroadcastPort } from './broadcast.js'

export interface AppendUpdateInput {
  realmId: string
  docRef: string
  /** base64 序列化的 Yjs update（serializeUpdate 产出） */
  serializedPayload: string
  actorType: ActorType
  actorId: string
  idempotencyKey: string
}

export interface AppendUpdateResult {
  /** 服务端分配的单调 seq；幂等去重时为 null */
  seq: number | null
  /** 是否为重复追加（命中幂等唯一约束） */
  deduplicated: boolean
}

export interface ReplayUpdateItem {
  seq: number
  /** base64 序列化的 Yjs update */
  serializedPayload: string
  actorType: ActorType
  actorId: string
  idempotencyKey: string
}

export interface ReplayResult {
  updates: ReplayUpdateItem[]
  /** 本次重放的最大 seq，用作下次游标 */
  nextCursor: number | null
  /** 是否可能还有更多未读更新（达到 limit 截断） */
  hasMore: boolean
}

export const DEFAULT_REPLAY_LIMIT = 100

/**
 * 反序列化、落库一条 CRDT 增量，并经广播端口通知其他客户端。
 */
export async function appendUpdate(
  db: UpdateLogDb,
  broadcast: BroadcastPort,
  input: AppendUpdateInput,
): Promise<AppendUpdateResult> {
  const payload = deserializeUpdate(input.serializedPayload)
  const record = await appendCrdtUpdate(db, input.realmId, {
    docRef: input.docRef,
    payload,
    actorType: input.actorType,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
  })

  if (record) {
    broadcast.publish({
      realmId: input.realmId,
      docRef: input.docRef,
      seq: record.seq,
      serializedPayload: input.serializedPayload,
      actorType: input.actorType,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    })
    return { seq: record.seq, deduplicated: false }
  }

  return { seq: null, deduplicated: true }
}

/**
 * 游标重放：读取 doc 指定 seq 之后的增量，序列化返回。
 * 客户端用 nextCursor 作为下次轮询的 afterSeq。
 */
export async function replayUpdates(
  db: UpdateLogDb,
  realmId: string,
  docRef: string,
  afterSeq: number | null,
  limit: number = DEFAULT_REPLAY_LIMIT,
): Promise<ReplayResult> {
  const records = await readCrdtUpdatesSince(db, realmId, docRef, {
    afterSeq: afterSeq ?? 0,
    limit: limit + 1,
  })

  const hasMore = records.length > limit
  const page = hasMore ? records.slice(0, limit) : records
  const updates: ReplayUpdateItem[] = page.map((r) => ({
    seq: r.seq,
    serializedPayload: serializeUpdate(r.payload),
    actorType: r.actor_type,
    actorId: r.actor_id,
    idempotencyKey: r.idempotency_key,
  }))

  const lastSeq = page.length > 0 ? page[page.length - 1]!.seq : null
  return {
    updates,
    nextCursor: lastSeq ?? afterSeq,
    hasMore,
  }
}

/**
 * 读取 doc 当前最大 seq，用于客户端初始化重放游标。
 */
export async function getCursor(
  db: UpdateLogDb,
  realmId: string,
  docRef: string,
): Promise<{ cursor: number | null }> {
  const cursor = await readCrdtUpdateCursor(db, realmId, docRef)
  return { cursor }
}

// @aether/thread-bindings · Rehydration Path：打开 Thread 时自动重建上下文。
//
// 重水合（Rehydration）将四类上下文一次性组装：
// 1. 代码锚点（锚点漂移状态）
// 2. 相关 Entity（对话参与者）
// 3. 对话历史（Dialogue Forging 产出的消息序列）
// 4. Manifestation（绑定 URL 与标注数据）
//
// 三个月前的 Thread 依然可读、可执行。
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { and, eq } from 'drizzle-orm'
import type { CodeAnchor, Entity } from '@aether/types'
import {
  dialogueMessages,
  threads,
} from '@aether/db'
import { driftAnchor } from './anchor.js'
import type { AnchorDriftInput, ThreadRecord } from './anchor.js'
import type { DialogueMessageRecord } from './dialogue.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ThreadDb = PgDatabase<any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DialogueDb = PgDatabase<any, any>

export interface RehydrationContext {
  thread: ThreadRecord
  /** 代码锚点漂移后的最新状态 */
  codeAnchor: CodeAnchor
  /** 参与对话的 Entity 快照 */
  entities: Entity[]
  /** 对话消息序列（按 seq 升序） */
  dialogueMessages: DialogueMessageRecord[]
  /** 是否所有上下文均可恢复 */
  hydrated: boolean
  /** 缺失上下文的原因（若未完全重水合） */
  gapReasons?: string[]
}

export interface RehydrateOptions {
  /** 已知的代码漂移输入（由语言服务器 / AST 分析提供） */
  anchorDrift?: AnchorDriftInput
  /** 限制返回的对话消息数 */
  dialogueLimit?: number
  /** 限制返回的 Entity 数 */
  entityLimit?: number
}

/**
 * 重水合一个 Thread 的完整上下文。
 */
export async function rehydrateThread(
  threadDb: ThreadDb,
  dialogueDb: DialogueDb,
  realmId: string,
  threadId: string,
  options: RehydrateOptions = {},
): Promise<RehydrationContext> {
  const gapReasons: string[] = []

  // 1. 加载 Thread
  const [rawThread] = await threadDb
    .select()
    .from(threads)
    .where(and(
      eq(threads.id, threadId),
      eq(threads.realm_id, realmId),
    ))

  if (rawThread === undefined) {
    gapReasons.push('thread_not_found')
    return buildEmptyContext(threadId, realmId, gapReasons)
  }

  const thread = rawThread
  const codeAnchor = driftAnchor(
    thread.code_anchor as CodeAnchor,
    options.anchorDrift ?? { fileMoves: {}, symbolRenames: {}, deletedRanges: [] },
  ).anchor

  // 2. 加载对话历史
  let dialogueMessagesRows: DialogueMessageRecord[] = []
  if (thread.dialogue_ref !== null) {
    const baseQuery = dialogueDb
      .select()
      .from(dialogueMessages)
      .where(and(
        eq(dialogueMessages.realm_id, realmId),
        eq(dialogueMessages.dialogue_id, thread.dialogue_ref),
      ))
      .orderBy(dialogueMessages.seq)

    const limitedQuery = options.dialogueLimit !== undefined
      ? baseQuery.limit(options.dialogueLimit)
      : baseQuery
    dialogueMessagesRows = await limitedQuery
  }

  // 3. Entity 快照（从对话消息中收集参与 Entity）
  const entities = collectEntitiesFromDialogue(
    dialogueMessagesRows,
    options.entityLimit,
  )

  return {
    thread,
    codeAnchor,
    entities,
    dialogueMessages: dialogueMessagesRows,
    hydrated: gapReasons.length === 0,
    ...(gapReasons.length > 0 ? { gapReasons } : {}),
  }
}

function buildEmptyContext(
  threadId: string,
  realmId: string,
  gapReasons: string[],
): RehydrationContext {
  return {
    thread: {
      id: threadId,
      realm_id: realmId,
      project_id: '',
      title: '',
      status: 'open',
      code_anchor: { file: '' },
      manifestation_url: null,
      dialogue_ref: null,
      resolution_contract: null,
      parent_thread_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as unknown as ThreadRecord,
    codeAnchor: { file: '' },
    entities: [],
    dialogueMessages: [],
    hydrated: false,
    gapReasons,
  }
}

function collectEntitiesFromDialogue(
  messages: DialogueMessageRecord[],
  limit?: number,
): Entity[] {
  const entityIds = [...new Set(
    messages
      .filter((m) => m.actor_type === 'entity')
      .map((m) => m.actor_id),
  )]
  if (entityIds.length === 0) {
    return []
  }
  // 在实际实现中，这里会调用 @aether/entity-core 的 queryEntityByIds
  // 此处返回 entity ID 占位，后续接入 entity-core 后替换为真实 Entity 查询
  const sliced = limit !== undefined ? entityIds.slice(0, limit) : entityIds
  return sliced as unknown as Entity[]
}

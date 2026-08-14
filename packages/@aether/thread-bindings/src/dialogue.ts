// @aether/thread-bindings · Dialogue Forging：Thread 内嵌与 Entity 的完整对话历史。
//
// dialogue_messages 表承载单次对话消息；threads.dialogue_ref 将一组消息绑定到 Thread，
// 形成可引用的决策记录。
import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'
import type { ActorType, DialogueRole } from '@aether/types'
import {
  dialogueMessages,
  threads,
} from '@aether/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DialogueDb = PgDatabase<any, any>

/** Drizzle 类型：dialogue_messages 表 SELECT 行的实际类型 */
export type DialogueMessageRecord = typeof dialogueMessages.$inferSelect

export interface CreateDialogueMessageInput {
  realmId: string
  dialogueId: string
  actorType: ActorType
  actorId: string
  role: DialogueRole
  content: string
  metadata?: Record<string, unknown>
}

/** 获取下一个对话序号 */
async function nextDialogueSeq(
  db: DialogueDb,
  realmId: string,
  dialogueId: string,
): Promise<number> {
  const rows = await db
    .select()
    .from(dialogueMessages)
    .where(and(
      eq(dialogueMessages.realm_id, realmId),
      eq(dialogueMessages.dialogue_id, dialogueId),
    ))
    .orderBy(dialogueMessages.seq)

  if (rows.length === 0) {
    return 1
  }
  return (rows as DialogueMessageRecord[]).at(-1)!.seq + 1
}

export async function createDialogueMessage(
  db: DialogueDb,
  realmId: string,
  input: CreateDialogueMessageInput,
): Promise<DialogueMessageRecord> {
  const seq = await nextDialogueSeq(db, realmId, input.dialogueId)
  const id = createId()
  const [record] = await db
    .insert(dialogueMessages)
    .values({
      id,
      realm_id: realmId,
      dialogue_id: input.dialogueId,
      seq,
      actor_type: input.actorType,
      actor_id: input.actorId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .returning()
  if (!record) {
    throw new Error('dialogue_messages insert returned no record')
  }
  return record
}

export async function getDialogueMessages(
  db: DialogueDb,
  realmId: string,
  dialogueId: string,
  options?: { limit?: number },
): Promise<DialogueMessageRecord[]> {
  const query = db
    .select()
    .from(dialogueMessages)
    .where(and(
      eq(dialogueMessages.realm_id, realmId),
      eq(dialogueMessages.dialogue_id, dialogueId),
    ))
    .orderBy(dialogueMessages.seq)

  return options?.limit !== undefined ? query.limit(options.limit) : query
}

export async function appendDialogueToThread(
  db: DialogueDb,
  realmId: string,
  threadId: string,
  dialogueId: string,
): Promise<void> {
  const row = await db
    .update(threads)
    .set({ dialogue_ref: dialogueId })
    .where(and(
      eq(threads.id, threadId),
      eq(threads.realm_id, realmId),
    ))
    .returning()
  if (row.length === 0) {
    throw new Error(`Thread ${threadId} not found in realm ${realmId}`)
  }
}

export async function removeDialogueFromThread(
  db: DialogueDb,
  realmId: string,
  threadId: string,
): Promise<void> {
  const row = await db
    .update(threads)
    .set({ dialogue_ref: null })
    .where(and(
      eq(threads.id, threadId),
      eq(threads.realm_id, realmId),
    ))
    .returning()
  if (row.length === 0) {
    throw new Error(`Thread ${threadId} not found in realm ${realmId}`)
  }
}

export async function clearDialogue(
  db: DialogueDb,
  realmId: string,
  dialogueId: string,
): Promise<number> {
  const rows = await db
    .delete(dialogueMessages)
    .where(and(
      eq(dialogueMessages.realm_id, realmId),
      eq(dialogueMessages.dialogue_id, dialogueId),
    ))
    .returning()
  return rows.length
}

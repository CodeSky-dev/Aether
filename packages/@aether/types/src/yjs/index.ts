// @aether/types · Yjs schema 类型基础
// 约定 Aether 各 Y.Doc 分区的结构化类型。运行时的 Yjs 结构定义（Y.Map/Y.Array/Y.XmlElement）
// 在 M1 由 @aether/current-sync 落地；本文件提供与 CRDT 分区对应的只读类型契约，
// 保证上层（Editor Host / Entity / Thread 绑定）读到的数据形状稳定。

// ---- Realm Channel Partition ----
// 每个 Realm 一个 Y.Doc，命名空间按 doc_ref 分区。分区内固定顶层结构。

export interface RealmYDocState {
  /** 分区版本号，递增驱动 Converge 对账 */
  version: number
  /** 全局 presence：key 为 actorId，value 为光标/在场快照 */
  presence: Record<string, unknown>
  /** Entity 光标流：key 为 entityId，value 为 cursor snapshot */
  entityCursors: Record<string, unknown>
}

export interface CodeDocumentState {
  /** 文件路径 → 文档内容（CRDT 文本） */
  files: Record<string, unknown>
  /** 文件路径 → 活跃编辑者集合 */
  activeEditors: Record<string, string[]>
  /** 文件路径 → 修订游标 */
  revision: Record<string, number>
}

export interface PresenceSnapshot {
  actorId: string
  cursor: { file: string; offset: number } | null
  selection: { file: string; start: number; end: number } | null
  lastSeenAt: number
}

// ---- CRDT 分区类型（Y.Doc 顶层 key）----

export type YDocPartitionKey =
  | 'realm'
  | 'code'
  | 'threads'
  | 'manifestations'

/** 各分区的顶层状态类型映射 */
export interface YDocPartitionMap {
  realm: RealmYDocState
  code: CodeDocumentState
  threads: Record<string, unknown>
  manifestations: Record<string, unknown>
}

export type YDocPartition<T extends YDocPartitionKey> = YDocPartitionMap[T]

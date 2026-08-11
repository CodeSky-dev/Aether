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
  /** 当前 PresenceChannel 实例的会话标识；旧客户端缺省时保持兼容。 */
  sessionId?: string
  cursor: { file: string; offset: number } | null
  selection: { file: string; start: number; end: number } | null
  lastSeenAt: number
  /** 本 actor 的单调 Presence 序号；旧客户端缺省为未带序号。 */
  sequence?: number
}

/** CRDT 文档结构版本契约，所有 Yjs 适配层共享此版本。 */
export const CRDT_SCHEMA_VERSION = 1

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

/** Current 汇合元数据的顶层 Y.Doc key，不属于业务分区。 */
export const YDOC_CONVERGE_METADATA_KEY =
  '__aether_current_sync_field_metadata' as const

/** 汇合元数据：分区字段标识 → 该字段最近一次提交时钟。 */
export interface YDocConvergeMetadata {
  [fieldKey: string]: number
}

/** Y.Doc 顶层汇合元数据结构映射。 */
export interface YDocMetadataMap {
  [YDOC_CONVERGE_METADATA_KEY]: YDocConvergeMetadata
}

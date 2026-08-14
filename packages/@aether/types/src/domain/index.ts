// @aether/types · 核心领域类型
// 字段与 docs/roadmap/data-model.md 草案对齐，命名遵守 Aether 术语体系。
// 与 Drizzle schema 共享同构结构，类型由 @aether/db 从 schema 派生时保持映射。

export type UUID = string
export type ISO8601 = string

export type ActorType = 'human' | 'entity'

// ---- realms（领域：隔离边界与权限树根）----

export interface Realm {
  id: UUID
  slug: string
  name: string
  auth_org_id: string
  schema_namespace: string
  residency: string
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- projects（Realm 二级节点）----

export interface Project {
  id: UUID
  realm_id: UUID
  slug: string
  name: string
  default_branch: string
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- members（Realm 三级节点，人类与 Entity 双主体）----

export type MemberStatus = 'active' | 'suspended' | 'invited'

export interface Member {
  id: UUID
  realm_id: UUID
  project_id: UUID | null
  actor_type: ActorType
  actor_id: UUID
  role: string
  entitlements: Record<string, unknown>
  status: MemberStatus
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- entities（实体：AI 一等公民档案）----

export type EntityStatus = 'active' | 'idle' | 'waiting' | 'suspended'

export interface CapabilityManifesto {
  capabilities: string[]
  permission_scopes: string[]
  available_tools: string[]
  /** schema 版本号，落库 jsonb 时按需保留（默认 1 时省略） */
  schema_version?: number
}

export interface Entity {
  id: UUID
  realm_id: UUID
  auth_identity_id: string
  display_name: string
  capability_manifesto: CapabilityManifesto
  status: EntityStatus
  memory_ref: Record<string, unknown>
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- threads（线程：Context-Bound 叙事单元）----

export type ThreadStatus = 'open' | 'in_review' | 'resolved' | 'archived'

export interface CodeAnchor {
  file: string
  range?: { start: number; end: number }
  snippet?: string
}

export interface ResolutionContract {
  close_conditions: string[]
  verify_steps: string[]
}

export interface Thread {
  id: UUID
  realm_id: UUID
  project_id: UUID
  title: string
  status: ThreadStatus
  code_anchor: CodeAnchor
  manifestation_url: string | null
  dialogue_ref: UUID | null
  resolution_contract: ResolutionContract | null
  parent_thread_id: UUID | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- currents（当前态：Yjs 连接实例与 Presence 状态流）----

export type ConnectionState = 'active' | 'drift' | 'converging'

export interface Current {
  id: UUID
  realm_id: UUID
  doc_ref: string
  presence_snapshot: Record<string, unknown>
  connection_state: ConnectionState
  last_converge_at: ISO8601 | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ---- audit_log（审计轨迹：人类与 Entity 行为统一入账）----

export type AuditAction =
  | 'read'
  | 'write'
  | 'permission_change'
  | 'converse'
  | 'execute'

export interface AuditLogEntry {
  id: UUID
  realm_id: UUID
  actor_type: ActorType
  actor_id: UUID
  action: AuditAction
  target: Record<string, unknown>
  payload_hash: string
  idempotency_key: string
  result: Record<string, unknown>
  created_at: ISO8601
}

// ---- Dialogue（Thread 内嵌对话历史）----

export type DialogueRole = 'user' | 'assistant' | 'system'

export interface DialogueMessage {
  id: UUID
  realm_id: UUID
  dialogue_id: UUID
  seq: number
  actor_type: ActorType
  actor_id: UUID
  role: DialogueRole
  content: string
  metadata: Record<string, unknown>
  created_at: ISO8601
}

// ---- 新建载荷（省略服务端生成字段）----

export type CreateRealm = Pick<Realm, 'slug' | 'name' | 'residency'>
export type CreateProject = Pick<Project, 'realm_id' | 'slug' | 'name'>
export type CreateThread = Pick<
  Thread,
  'realm_id' | 'project_id' | 'title' | 'code_anchor'
>

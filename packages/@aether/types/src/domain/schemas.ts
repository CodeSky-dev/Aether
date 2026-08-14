// @aether/types · Zod 运行时校验 Schema
// 为领域类型提供运行期校验兜底，防止类型错误逃逸（对应 risks.md 风险 4）。
// 与 domain/index.ts 中的 TypeScript 类型保持同构。

import { z } from 'zod'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d+)?(Z|[+-]\d{2}:\d{2})$/

const UUIDSchema = z.string().regex(UUID_REGEX, 'Invalid UUID format')
const ISO8601Schema = z.string().regex(ISO8601_REGEX, 'Invalid ISO8601 datetime format')

// Actor Type
export const ActorTypeSchema = z.enum(['human', 'entity'])
export type ActorType = z.infer<typeof ActorTypeSchema>

// ---- Realms ----

export const RealmSchema = z.object({
  id: UUIDSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  auth_org_id: z.string(),
  schema_namespace: z.string(),
  residency: z.string(),
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Realm = z.infer<typeof RealmSchema>

export const CreateRealmSchema = RealmSchema.pick({
  slug: true,
  name: true,
  residency: true,
})
export type CreateRealm = z.infer<typeof CreateRealmSchema>

// ---- Projects ----

export const ProjectSchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  default_branch: z.string(),
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectSchema = ProjectSchema.pick({
  realm_id: true,
  slug: true,
  name: true,
})
export type CreateProject = z.infer<typeof CreateProjectSchema>

// ---- Members ----

export const MemberStatusSchema = z.enum(['active', 'suspended', 'invited'])
export type MemberStatus = z.infer<typeof MemberStatusSchema>

export const MemberSchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  project_id: UUIDSchema.nullable(),
  actor_type: ActorTypeSchema,
  actor_id: UUIDSchema,
  role: z.string(),
  entitlements: z.record(z.unknown()),
  status: MemberStatusSchema,
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Member = z.infer<typeof MemberSchema>

// ---- Entities ----

export const EntityStatusSchema = z.enum(['active', 'idle', 'waiting', 'suspended'])
export type EntityStatus = z.infer<typeof EntityStatusSchema>

export const CapabilityManifestoSchema = z.object({
  capabilities: z.array(z.string()),
  permission_scopes: z.array(z.string()),
  available_tools: z.array(z.string()),
  schema_version: z.number().optional(),
})
export type CapabilityManifesto = z.infer<typeof CapabilityManifestoSchema>

export const EntitySchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  auth_identity_id: z.string(),
  display_name: z.string(),
  capability_manifesto: CapabilityManifestoSchema,
  status: EntityStatusSchema,
  memory_ref: z.record(z.unknown()),
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Entity = z.infer<typeof EntitySchema>

// ---- Threads ----

export const ThreadStatusSchema = z.enum(['open', 'in_review', 'resolved', 'archived'])
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>

export const CodeAnchorSchema = z.object({
  file: z.string(),
  range: z.object({ start: z.number(), end: z.number() }).optional(),
  snippet: z.string().optional(),
})
export type CodeAnchor = z.infer<typeof CodeAnchorSchema>

export const ResolutionContractSchema = z.object({
  close_conditions: z.array(z.string()),
  verify_steps: z.array(z.string()),
})
export type ResolutionContract = z.infer<typeof ResolutionContractSchema>

export const ThreadSchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  project_id: UUIDSchema,
  title: z.string(),
  status: ThreadStatusSchema,
  code_anchor: CodeAnchorSchema,
  manifestation_url: z.string().nullable(),
  dialogue_ref: UUIDSchema.nullable(),
  resolution_contract: ResolutionContractSchema.nullable(),
  parent_thread_id: UUIDSchema.nullable(),
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Thread = z.infer<typeof ThreadSchema>

export const CreateThreadSchema = ThreadSchema.pick({
  realm_id: true,
  project_id: true,
  title: true,
  code_anchor: true,
})
export type CreateThread = z.infer<typeof CreateThreadSchema>

// ---- Currents ----

export const ConnectionStateSchema = z.enum(['active', 'drift', 'converging'])
export type ConnectionState = z.infer<typeof ConnectionStateSchema>

export const CurrentSchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  doc_ref: z.string(),
  presence_snapshot: z.record(z.unknown()),
  connection_state: ConnectionStateSchema,
  last_converge_at: ISO8601Schema.nullable(),
  created_at: ISO8601Schema,
  updated_at: ISO8601Schema,
})
export type Current = z.infer<typeof CurrentSchema>

// ---- Audit Log ----

export const AuditActionSchema = z.enum([
  'read',
  'write',
  'permission_change',
  'converse',
  'execute',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditLogEntrySchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  actor_type: ActorTypeSchema,
  actor_id: UUIDSchema,
  action: AuditActionSchema,
  target: z.record(z.unknown()),
  payload_hash: z.string(),
  idempotency_key: z.string(),
  result: z.record(z.unknown()),
  created_at: ISO8601Schema,
})
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>

// ---- Dialogue（Thread 内嵌对话历史）----

export const DialogueRoleSchema = z.enum(['user', 'assistant', 'system'])
export type DialogueRole = z.infer<typeof DialogueRoleSchema>

export const DialogueMessageSchema = z.object({
  id: UUIDSchema,
  realm_id: UUIDSchema,
  dialogue_id: UUIDSchema,
  seq: z.number(),
  actor_type: ActorTypeSchema,
  actor_id: UUIDSchema,
  role: DialogueRoleSchema,
  content: z.string(),
  metadata: z.record(z.unknown()),
  created_at: ISO8601Schema,
})
export type DialogueMessage = z.infer<typeof DialogueMessageSchema>

// @aether/db · Drizzle schema
// 表结构与字段对齐 docs/roadmap/data-model.md，命名遵循 Aether 术语体系。
// schema 是 @aether/types 领域类型的运行期实现映射；类型保持同构。
import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

export const actorTypeEnum = pgEnum('actor_type', ['human', 'entity'])

export const memberStatusEnum = pgEnum('member_status', [
  'active',
  'suspended',
  'invited',
])

export const entityStatusEnum = pgEnum('entity_status', [
  'active',
  'idle',
  'waiting',
  'suspended',
])

export const threadStatusEnum = pgEnum('thread_status', [
  'open',
  'in_review',
  'resolved',
  'archived',
])

export const connectionStateEnum = pgEnum('connection_state', [
  'active',
  'drift',
  'converging',
])

export const auditActionEnum = pgEnum('audit_action', [
  'read',
  'write',
  'permission_change',
  'converse',
  'execute',
])

// ---- realms（领域：隔离边界与权限树根）----

export const realms = pgTable(
  'realms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    auth_org_id: text('auth_org_id').notNull(),
    schema_namespace: text('schema_namespace').notNull(),
    residency: text('residency').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('realms_slug_idx').on(t.slug)],
)

// ---- projects（Realm 二级节点）----

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    default_branch: text('default_branch').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('projects_realm_slug_idx').on(t.realm_id, t.slug),
  ],
)

// ---- members（Realm 三级节点，人类与 Entity 双主体）----

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    project_id: uuid('project_id').references(() => projects.id),
    actor_type: actorTypeEnum('actor_type').notNull(),
    actor_id: uuid('actor_id').notNull(),
    role: text('role').notNull(),
    entitlements: jsonb('entitlements').notNull().default({}),
    status: memberStatusEnum('status').notNull().default('active'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('members_actor_idx').on(t.realm_id, t.actor_type, t.actor_id),
  ],
)

// ---- entities（实体：AI 一等公民档案）----

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    auth_identity_id: text('auth_identity_id').notNull(),
    display_name: text('display_name').notNull(),
    capability_manifesto: jsonb('capability_manifesto').notNull().default({}),
    status: entityStatusEnum('status').notNull().default('idle'),
    memory_ref: jsonb('memory_ref').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('entities_auth_identity_idx').on(t.auth_identity_id),
  ],
)

// ---- threads（线程：Context-Bound 叙事单元）----

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    status: threadStatusEnum('status').notNull().default('open'),
    code_anchor: jsonb('code_anchor').notNull().default({}),
    manifestation_url: text('manifestation_url'),
    dialogue_ref: uuid('dialogue_ref'),
    resolution_contract: jsonb('resolution_contract'),
    parent_thread_id: uuid('parent_thread_id').references(
      (): AnyPgColumn => threads.id,
    ),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('threads_realm_created_idx').on(t.realm_id, t.created_at)],
)

// ---- currents（当前态：Yjs 连接实例与 Presence 状态流）----

export const currents = pgTable(
  'currents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    doc_ref: text('doc_ref').notNull(),
    presence_snapshot: jsonb('presence_snapshot').notNull().default({}),
    connection_state: connectionStateEnum('connection_state')
      .notNull()
      .default('active'),
    last_converge_at: timestamp('last_converge_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('currents_doc_ref_idx').on(t.doc_ref)],
)

// ---- audit_log（审计轨迹：人类与 Entity 行为统一入账）----

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    realm_id: uuid('realm_id')
      .notNull()
      .references(() => realms.id),
    actor_type: actorTypeEnum('actor_type').notNull(),
    actor_id: uuid('actor_id').notNull(),
    action: auditActionEnum('action').notNull(),
    target: jsonb('target').notNull().default({}),
    payload_hash: text('payload_hash').notNull(),
    idempotency_key: text('idempotency_key').notNull(),
    result: jsonb('result').notNull().default({}),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('audit_log_idempotency_idx').on(t.idempotency_key),
    uniqueIndex('audit_log_realm_created_idx').on(t.realm_id, t.created_at),
  ],
)

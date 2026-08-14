// @aether/entity-core · Capability Manifesto 声明与校验
// Entity 在档案中声明自己的能力清单（capabilities/permission_scopes/available_tools），
// 运行时校验 manifesto 结构、检查工具调用与权限语句授权。
//
// 与 @aether/auth 的 realmStatements 对齐：permission_scopes 是 Realm Tree 授权语句，
// 申请的权限需经 Realm Admin 在 members.entitlements 中确认后才能生效。
//
// 与 @aether/types 的 CapabilityManifesto（弱类型 jsonb 形态）保持兼容：
// - db 侧（jsonb 列）：弱类型 Record<string, unknown>，由 @aether/types 类型化
// - 运行时（entity-core）：强类型 RealmStatement 与校验
import type { CapabilityManifesto as StoredManifesto } from '@aether/types'

// 与 @aether/auth realmStatements 对齐的合法 statement 集合
// 形如 "<resource>:<action>"，与 Better-Auth access control 语句一致
export const REALM_STATEMENTS = [
  'realm:read',
  'realm:update',
  'realm:delete',
  'realm:manage_member',
  'project:create',
  'project:read',
  'project:update',
  'project:delete',
  'thread:create',
  'thread:read',
  'thread:update',
  'thread:resolve',
  'thread:archive',
  'entity:read',
  'entity:create',
  'entity:update',
  'current:read',
  'current:converge',
  'current:drift',
  'audit:read',
] as const

export type RealmStatement = (typeof REALM_STATEMENTS)[number]

export const REALM_STATEMENT_SET: ReadonlySet<string> = new Set(REALM_STATEMENTS)

// 强类型 Manifesto：permission_scopes 收窄为 RealmStatement
// 与 @aether/types CapabilityManifesto 在结构上同构（jsonb 落库兼容）
export interface CapabilityManifesto {
  /** Entity 自描述的业务能力标签（如 "code-review"、"thread-summary"） */
  capabilities: readonly string[]
  /** 申请的 Realm 授权语句；生效需 Realm Admin 在 member.entitlements 中确认 */
  permission_scopes: readonly RealmStatement[]
  /** 可调用的工具白名单；空数组表示无工具能力 */
  available_tools: readonly string[]
  /** manifesto 版本，便于演进 */
  schema_version: number
}

// 与 @aether/types 的弱类型 manifesto 在 jsonb 层面兼容
export type StoredCapabilityManifesto = StoredManifesto

export const MANIFESTO_SCHEMA_VERSION = 1

export interface ManifestoValidationResult {
  ok: boolean
  errors: readonly string[]
  manifesto: CapabilityManifesto | null
}

export interface DeclareManifestoInput {
  capabilities?: readonly string[]
  permission_scopes?: readonly RealmStatement[]
  available_tools?: readonly string[]
  schema_version?: number
}

/**
 * 声明一份 Capability Manifesto。构造时去重，保证内部一致性。
 * 用于新建/更新 Entity 档案时构造强类型 manifesto，落库前再转 StoredManifesto。
 */
export function declareCapabilityManifesto(
  input: DeclareManifestoInput = {},
): CapabilityManifesto {
  return {
    capabilities: dedupe(input.capabilities ?? []),
    permission_scopes: dedupe(input.permission_scopes ?? []),
    available_tools: dedupe(input.available_tools ?? []),
    schema_version: input.schema_version ?? MANIFESTO_SCHEMA_VERSION,
  }
}

/**
 * 将强类型 manifesto 转为 jsonb 兼容形态（写入 db 前调用）。
 */
export function toStoredManifesto(
  manifesto: CapabilityManifesto,
): StoredManifesto {
  return {
    capabilities: [...manifesto.capabilities],
    permission_scopes: [...manifesto.permission_scopes],
    available_tools: [...manifesto.available_tools],
    // schema_version 不在 @aether/types 的 StoredManifesto 字段内，但 jsonb 列允许扩展字段
    // 通过额外键保留版本信息，校验时优先读取
    ...(manifesto.schema_version !== MANIFESTO_SCHEMA_VERSION
      ? { schema_version: manifesto.schema_version }
      : {}),
  }
}

/**
 * 校验从 db jsonb 读出的弱类型 manifesto。
 * 成功时返回强类型 manifesto；失败时返回错误清单。
 */
export function validateCapabilityManifesto(
  raw: unknown,
): ManifestoValidationResult {
  const errors: string[] = []

  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      errors: ['manifesto must be an object'],
      manifesto: null,
    }
  }

  const obj = raw as Record<string, unknown>

  const capabilities = parseStringArray(obj.capabilities, 'capabilities', errors)

  const rawScopes = parseStringArray(
    obj.permission_scopes,
    'permission_scopes',
    errors,
  )
  const validScopes: RealmStatement[] = []
  for (const scope of rawScopes) {
    if (!REALM_STATEMENT_SET.has(scope)) {
      errors.push(`unknown permission_scope: ${scope}`)
      continue
    }
    validScopes.push(scope as RealmStatement)
  }

  const available_tools = parseStringArray(
    obj.available_tools,
    'available_tools',
    errors,
  )

  let schema_version = MANIFESTO_SCHEMA_VERSION
  if (obj.schema_version !== undefined) {
    if (
      typeof obj.schema_version !== 'number' ||
      !Number.isFinite(obj.schema_version)
    ) {
      errors.push('schema_version must be a finite number')
    } else {
      schema_version = obj.schema_version
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, manifesto: null }
  }

  return {
    ok: true,
    errors: [],
    manifesto: declareCapabilityManifesto({
      capabilities,
      permission_scopes: validScopes,
      available_tools,
      schema_version,
    }),
  }
}

/**
 * 检查 Entity 是否声明了某项权限语句。
 * 注意：声明 ≠ 授权。授权需进一步调用 isPermissionGranted 检查 entitlements。
 */
export function hasPermission(
  manifesto: CapabilityManifesto,
  statement: RealmStatement,
): boolean {
  return manifesto.permission_scopes.includes(statement)
}

/**
 * 检查 Entity 是否被 Realm Admin 授权某项权限。
 * members.entitlements 约定：key 为 statement，value === true 表示已授权。
 * manifesto 申请 + entitlements 授权，二者同时满足才生效。
 */
export function isPermissionGranted(
  manifesto: CapabilityManifesto,
  entitlements: Record<string, unknown>,
  statement: RealmStatement,
): boolean {
  if (!hasPermission(manifesto, statement)) {
    return false
  }
  return entitlements[statement] === true
}

/**
 * 检查 Entity 是否可调用某工具。
 * available_tools 为白名单：未声明则不可调用。
 */
export function canInvokeTool(
  manifesto: CapabilityManifesto,
  tool: string,
): boolean {
  if (manifesto.available_tools.length === 0) {
    return false
  }
  return manifesto.available_tools.includes(tool)
}

// ---- 内部工具 ----

function dedupe<T>(items: readonly T[]): readonly T[] {
  return Array.from(new Set(items))
}

function parseStringArray(
  value: unknown,
  field: string,
  errors: string[],
): string[] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`)
    return []
  }
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      errors.push(`${field} must contain only strings`)
      continue
    }
    if (item.length === 0) {
      errors.push(`${field} must not contain empty strings`)
      continue
    }
    result.push(item)
  }
  return result
}

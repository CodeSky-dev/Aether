// @aether/entity-core · Capability Manifesto 单元测试
import { describe, it, expect } from 'vitest'
import {
  MANIFESTO_SCHEMA_VERSION,
  REALM_STATEMENTS,
  canInvokeTool,
  declareCapabilityManifesto,
  hasPermission,
  isPermissionGranted,
  toStoredManifesto,
  validateCapabilityManifesto,
} from '../src/manifesto.js'

describe('declareCapabilityManifesto', () => {
  it('声明一份默认 manifesto（全空字段）', () => {
    const m = declareCapabilityManifesto()
    expect(m.capabilities).toEqual([])
    expect(m.permission_scopes).toEqual([])
    expect(m.available_tools).toEqual([])
    expect(m.schema_version).toBe(MANIFESTO_SCHEMA_VERSION)
  })

  it('声明时去重', () => {
    const m = declareCapabilityManifesto({
      capabilities: ['code-review', 'code-review', 'summary'],
      permission_scopes: ['thread:read', 'thread:read', 'thread:create'],
      available_tools: ['search', 'search', 'edit'],
    })
    expect(m.capabilities).toEqual(['code-review', 'summary'])
    expect(m.permission_scopes).toEqual(['thread:read', 'thread:create'])
    expect(m.available_tools).toEqual(['search', 'edit'])
  })

  it('可覆盖 schema_version', () => {
    const m = declareCapabilityManifesto({ schema_version: 2 })
    expect(m.schema_version).toBe(2)
  })
})

describe('toStoredManifesto / validateCapabilityManifesto', () => {
  it('强类型 → 存储 → 校验往返保持一致', () => {
    const original = declareCapabilityManifesto({
      capabilities: ['code-review'],
      permission_scopes: ['thread:read', 'thread:create'],
      available_tools: ['search'],
    })
    const stored = toStoredManifesto(original)
    const result = validateCapabilityManifesto(stored)
    expect(result.ok).toBe(true)
    expect(result.manifesto).not.toBeNull()
    expect(result.manifesto!.capabilities).toEqual(['code-review'])
    expect(result.manifesto!.permission_scopes).toEqual([
      'thread:read',
      'thread:create',
    ])
    expect(result.manifesto!.available_tools).toEqual(['search'])
    expect(result.manifesto!.schema_version).toBe(MANIFESTO_SCHEMA_VERSION)
  })

  it('schema_version 非默认值时保留', () => {
    const original = declareCapabilityManifesto({
      schema_version: 3,
      capabilities: ['x'],
    })
    const stored = toStoredManifesto(original)
    expect(stored.schema_version).toBe(3)
    const result = validateCapabilityManifesto(stored)
    expect(result.ok).toBe(true)
    expect(result.manifesto!.schema_version).toBe(3)
  })

  it('拒绝非对象输入', () => {
    expect(validateCapabilityManifesto(null).ok).toBe(false)
    expect(validateCapabilityManifesto('string').ok).toBe(false)
    expect(validateCapabilityManifesto(42).ok).toBe(false)
  })

  it('拒绝未知 permission_scope', () => {
    const result = validateCapabilityManifesto({
      capabilities: [],
      permission_scopes: ['bogus:action'],
      available_tools: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('unknown permission_scope: bogus:action')
  })

  it('拒绝非数组字段', () => {
    const result = validateCapabilityManifesto({
      capabilities: 'not-an-array',
      permission_scopes: [],
      available_tools: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('capabilities'))).toBe(true)
  })

  it('拒绝空字符串元素', () => {
    const result = validateCapabilityManifesto({
      capabilities: [''],
      permission_scopes: [],
      available_tools: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('empty'))).toBe(true)
  })

  it('拒绝非数字 schema_version', () => {
    const result = validateCapabilityManifesto({
      capabilities: [],
      permission_scopes: [],
      available_tools: [],
      schema_version: 'not-a-number',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('schema_version'))).toBe(true)
  })

  it('缺省字段视为空数组（兼容旧数据）', () => {
    const result = validateCapabilityManifesto({})
    expect(result.ok).toBe(true)
    expect(result.manifesto!.capabilities).toEqual([])
    expect(result.manifesto!.permission_scopes).toEqual([])
  })
})

describe('REALM_STATEMENTS', () => {
  it('包含全部 Realm Tree 授权语句', () => {
    // 抽样验证关键语句
    expect(REALM_STATEMENTS).toContain('realm:read')
    expect(REALM_STATEMENTS).toContain('thread:create')
    expect(REALM_STATEMENTS).toContain('entity:update')
    expect(REALM_STATEMENTS).toContain('current:converge')
    expect(REALM_STATEMENTS).toContain('audit:read')
  })
})

describe('hasPermission / isPermissionGranted', () => {
  const manifesto = declareCapabilityManifesto({
    permission_scopes: ['thread:read', 'thread:create'],
  })

  it('hasPermission 检查 manifesto 声明', () => {
    expect(hasPermission(manifesto, 'thread:read')).toBe(true)
    expect(hasPermission(manifesto, 'thread:create')).toBe(true)
    expect(hasPermission(manifesto, 'thread:resolve')).toBe(false)
  })

  it('isPermissionGranted 需 manifesto 声明 + entitlements 授权', () => {
    // manifesto 声明 + entitlements 授权
    expect(
      isPermissionGranted(manifesto, { 'thread:read': true }, 'thread:read'),
    ).toBe(true)
    // manifesto 声明但 entitlements 未授权
    expect(
      isPermissionGranted(manifesto, { 'thread:read': false }, 'thread:read'),
    ).toBe(false)
    // manifesto 未声明
    expect(
      isPermissionGranted(manifesto, { 'thread:resolve': true }, 'thread:resolve'),
    ).toBe(false)
    // entitlements 缺少 key
    expect(isPermissionGranted(manifesto, {}, 'thread:read')).toBe(false)
  })
})

describe('canInvokeTool', () => {
  it('白名单包含工具时返回 true', () => {
    const m = declareCapabilityManifesto({ available_tools: ['search', 'edit'] })
    expect(canInvokeTool(m, 'search')).toBe(true)
    expect(canInvokeTool(m, 'edit')).toBe(true)
  })

  it('白名单不包含工具时返回 false', () => {
    const m = declareCapabilityManifesto({ available_tools: ['search'] })
    expect(canInvokeTool(m, 'delete')).toBe(false)
  })

  it('空白名单时全部返回 false', () => {
    const m = declareCapabilityManifesto()
    expect(canInvokeTool(m, 'search')).toBe(false)
  })
})

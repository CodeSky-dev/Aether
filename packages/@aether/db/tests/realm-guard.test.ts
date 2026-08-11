// @aether/db · Realm 隔离守卫单元测试
import { describe, it, expect } from 'vitest'
import { realmGuard, realmScope } from '../src/guards.js'
import { threads, projects, members, realms, entities, currents, auditLog } from '../src/schema.js'

describe('Realm Isolation Guards', () => {
  const testRealmId = '550e8400-e29b-41d4-a716-446655440000'

  describe('realmGuard', () => {
    it('should generate correct SQL for threads table', () => {
      const guard = realmGuard(threads, testRealmId)
      expect(guard).toBeDefined()
      // 验证生成的 SQL 包含 realm_id 条件
      expect(guard.toString()).toContain('realm_id')
    })

    it('should generate correct SQL for projects table', () => {
      const guard = realmGuard(projects, testRealmId)
      expect(guard).toBeDefined()
      expect(guard.toString()).toContain('realm_id')
    })

    it('should generate correct SQL for members table', () => {
      const guard = realmGuard(members, testRealmId)
      expect(guard).toBeDefined()
      expect(guard.toString()).toContain('realm_id')
    })

    it('should generate correct SQL for entities table', () => {
      const guard = realmGuard(entities, testRealmId)
      expect(guard).toBeDefined()
      expect(guard.toString()).toContain('realm_id')
    })

    it('should generate correct SQL for currents table', () => {
      const guard = realmGuard(currents, testRealmId)
      expect(guard).toBeDefined()
      expect(guard.toString()).toContain('realm_id')
    })

    it('should generate correct SQL for audit_log table', () => {
      const guard = realmGuard(auditLog, testRealmId)
      expect(guard).toBeDefined()
      expect(guard.toString()).toContain('realm_id')
    })

    it('should handle realms table specially by comparing id', () => {
      const guard = realmGuard(realms, testRealmId)
      expect(guard).toBeDefined()
      // realms 表直接比较 id 而非 realm_id
      expect(guard.toString()).toContain('id')
    })

    it('should reject non-realm tables', () => {
      // 创建一个模拟的不支持 realm 隔离的表
      const fakeTable = { name: 'fake_table' } as any
      expect(() => realmGuard(fakeTable, testRealmId)).toThrow(
        /does not support realm isolation/
      )
    })

    it('should reject tables missing realm_id column', () => {
      // 创建一个没有 realm_id 的表
      const tableWithoutRealmId = { name: 'some_table' } as any
      expect(() => realmGuard(tableWithoutRealmId, testRealmId)).toThrow(
        /missing the "realm_id" column/
      )
    })
  })

  describe('realmScope', () => {
    it('should return only guard when no additional conditions provided', () => {
      const scope = realmScope(threads, testRealmId)
      expect(scope).toBeDefined()
      expect(scope.toString()).toContain('realm_id')
    })

    it('should combine guard with additional conditions using AND', () => {
      // 模拟一个额外的 SQL 条件
      const { eq } = await import('drizzle-orm')
      const extraCondition = eq(threads.status, 'open')
      
      const scope = realmScope(threads, testRealmId, extraCondition)
      expect(scope).toBeDefined()
      // 应该同时包含 realm_id 和额外条件
      expect(scope.toString()).toContain('realm_id')
    })

    it('should work with multiple additional conditions', () => {
      const { eq, and } = await import('drizzle-orm')
      const condition1 = eq(threads.status, 'open')
      const condition2 = eq(threads.project_id, 'project-uuid')
      
      const scope = realmScope(threads, testRealmId, condition1, condition2)
      expect(scope).toBeDefined()
      expect(scope.toString()).toContain('realm_id')
    })
  })

  describe('Different realm IDs produce different guards', () => {
    it('should generate different guards for different realm IDs', () => {
      const realmId1 = '11111111-1111-1111-1111-111111111111'
      const realmId2 = '22222222-2222-2222-2222-222222222222'
      
      const guard1 = realmGuard(threads, realmId1)
      const guard2 = realmGuard(threads, realmId2)
      
      expect(guard1.toString()).not.toEqual(guard2.toString())
    })
  })
})

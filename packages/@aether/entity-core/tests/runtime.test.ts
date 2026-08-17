// @aether/entity-core · Entity AI Runtime 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  EntityRuntime,
  EntityHandoffRequiredError,
  createEntityRuntime,
  type EntityLanguageModel,
  type EntityToolDefinition,
} from '../src/runtime.js'
import type { AuditDb } from '../src/audit.js'
import {
  declareCapabilityManifesto,
  type CapabilityManifesto,
} from '../src/manifesto.js'
import { HandoffGate } from '../src/handoff.js'

const ENTITY_ID = 'ent-test-0001'
const REALM_ID = 'realm-test-0001'

function createMockEntity(manifesto: CapabilityManifesto) {
  return {
    id: ENTITY_ID,
    realm_id: REALM_ID,
    auth_identity_id: 'auth-0001',
    display_name: 'TestEntity',
    capability_manifesto: {
      capabilities: manifesto.capabilities,
      permission_scopes: manifesto.permission_scopes,
      available_tools: manifesto.available_tools,
      schema_version: manifesto.schema_version,
    },
    status: 'active' as const,
    memory_ref: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  }
}

function createMockModel(responses: Map<string, { text: string; toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }> }>): EntityLanguageModel {
  let callCount = 0
  return {
    generateText(options) {
      callCount++
      const key = (options.messages?.map(m => `${m.role}:${m.content}`).join('|')) ?? ''
      const response = responses.get(key) ?? responses.get('*') ?? { text: 'fallback response' }
      // First call returns tool calls, subsequent calls return just text
      const hasToolCalls = response.toolCalls && response.toolCalls.length > 0
      if (callCount === 1 && hasToolCalls) {
        return Promise.resolve({
          text: response.text,
          toolCalls: response.toolCalls,
        })
      }
      return Promise.resolve({ text: response.text })
    },
  }
}

function createMockDb() {
  const records: Array<{ id: string; action: string; actor_id: string }> = []
  const mockDb = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: `audit-${records.length}`, action: 'converse', actor_id: ENTITY_ID }]),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 'updated' }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => []),
      })),
    })),
  }
  return mockDb
}

describe('EntityRuntime - 基础对话', () => {
  let runtime: EntityRuntime
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(() => {
    const manifesto = declareCapabilityManifesto({
      capabilities: ['general'],
      available_tools: [],
    })
    const entity = createMockEntity(manifesto)
    const model = createMockModel(new Map([
      ['*', { text: 'Hello! I am TestEntity.' }],
    ]))
    runtime = new EntityRuntime({ entity, model, manifesto })
    mockDb = createMockDb()
  })

  it('chat 返回 AI 回复', async () => {
    const result = await runtime.chat(mockDb as unknown as AuditDb, REALM_ID, [
      { role: 'user', content: 'Hi' },
    ])
    expect(result.reply).toBe('Hello! I am TestEntity.')
    expect(result.toolCalls).toHaveLength(0)
    expect(result.auditIds.length).toBeGreaterThan(0)
  })

  it('维护对话历史', async () => {
    await runtime.chat(mockDb as unknown as AuditDb, REALM_ID, [
      { role: 'user', content: 'First' },
    ])
    const history = runtime.getConversationHistory()
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]?.role).toBe('system')
  })

  it('clearConversationHistory 清空历史', () => {
    runtime.clearConversationHistory()
    expect(runtime.getConversationHistory()).toHaveLength(0)
  })

  it('非 active 状态抛出错误', async () => {
    const manifesto = declareCapabilityManifesto()
    const entity = { ...createMockEntity(manifesto), status: 'idle' as const }
    const model = createMockModel(new Map([['*', { text: 'X' }]]))
    const rt = new EntityRuntime({ entity, model, manifesto })
    await expect(rt.chat(mockDb as unknown as AuditDb, REALM_ID, [{ role: 'user', content: 'Hi' }]))
      .rejects.toThrow(/not active/)
  })
})

describe('EntityRuntime - 工具调用', () => {
  let runtime: EntityRuntime
  let mockDb: ReturnType<typeof createMockDb>
  let tools: Record<string, EntityToolDefinition>
  let toolExecutionLog: string[]

  beforeEach(() => {
    toolExecutionLog = []
    const manifesto = declareCapabilityManifesto({
      capabilities: ['code-review'],
      available_tools: ['search', 'edit'],
    })
    const entity = createMockEntity(manifesto)

    const responses = new Map([
      ['*', {
        text: 'I found the issue.',
        toolCalls: [{ toolName: 'search', args: { query: 'bug' } }],
      }],
    ])
    const model = createMockModel(responses)
    runtime = new EntityRuntime({ entity, model, manifesto })
    mockDb = createMockDb()

    tools = {
      search: {
        description: 'Search codebase',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
        execute(args) {
          toolExecutionLog.push(`search:${String(args.query)}`)
          return Promise.resolve({ results: ['file1.ts', 'file2.ts'] })
        },
      },
      edit: {
        description: 'Edit file',
        parameters: { type: 'object', properties: { file: { type: 'string' } } },
        execute(args) {
          toolExecutionLog.push(`edit:${String(args.file)}`)
          return Promise.resolve({ success: true })
        },
        requiresHandoff: false,
      },
      dangerous_delete: {
        description: 'Delete file',
        parameters: {},
        execute() {
          toolExecutionLog.push('delete')
          return Promise.resolve({ deleted: true })
        },
        requiresHandoff: true,
      },
    }
  })

  it('manifesto 白名单内的工具可被调用', async () => {
    const result = await runtime.chat(mockDb as unknown as AuditDb, REALM_ID, [
      { role: 'user', content: 'Find the bug' },
    ], tools)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.toolName).toBe('search')
    expect(toolExecutionLog).toContain('search:bug')
  })

  it('manifesto 白名单外的工具被过滤', () => {
    // dangerous_delete 不在 available_tools 中，应被过滤
    const filtered = runtime['filterToolsByManifesto'](tools)
    expect(filtered).toHaveProperty('search')
    expect(filtered).toHaveProperty('edit')
    expect(filtered).not.toHaveProperty('dangerous_delete')
  })

  it('空工具列表时不报错', async () => {
    const result = await runtime.chat(mockDb as unknown as AuditDb, REALM_ID, [
      { role: 'user', content: 'Hello' },
    ])
    expect(result.reply).toBeTruthy()
  })
})

describe('EntityRuntime - HandoffGate 集成', () => {
  it('requiresHandoff 工具触发 HandoffRequiredError', async () => {
    const manifesto = declareCapabilityManifesto({
      capabilities: [' destructive'],
      available_tools: ['delete_file'],
    })
    const entity = createMockEntity(manifesto)
    const handoffGate = new HandoffGate({
      entityId: ENTITY_ID,
      initialState: 'active',
    })

    const model = createMockModel(new Map([
      ['*', {
        text: 'I need to delete this file.',
        toolCalls: [{ toolName: 'delete_file', args: { path: '/tmp/test' } }],
      }],
    ]))

    const runtime = new EntityRuntime({
      entity,
      model,
      manifesto,
      handoffGate,
    })
    const mockDb = createMockDb()

    const tools: Record<string, EntityToolDefinition> = {
      delete_file: {
        description: 'Delete a file',
        parameters: { type: 'object' },
        execute() {
          return Promise.resolve({ deleted: true })
        },
        requiresHandoff: true,
      },
    }

    await expect(
      runtime.chat(mockDb as unknown as AuditDb, REALM_ID, [
        { role: 'user', content: 'Delete this file' },
      ], tools),
    ).rejects.toThrow(EntityHandoffRequiredError)
  })

  it('HandoffGate waiting 状态时 runtime.canAct() 返回 false', () => {
    const manifesto = declareCapabilityManifesto()
    const entity = createMockEntity(manifesto)
    const handoffGate = new HandoffGate({
      entityId: ENTITY_ID,
      initialState: 'active',
    })
    handoffGate.requestHandoff({ operation: 'test', payloadHash: 'hash' })

    const model = createMockModel(new Map([['*', { text: 'X' }]]))
    const runtime = new EntityRuntime({
      entity,
      model,
      manifesto,
      handoffGate,
    })
    expect(runtime.canAct()).toBe(false)
  })
})

describe('createEntityRuntime 工厂', () => {
  it('从 Entity 档案和 manifesto 创建 runtime', () => {
    const storedManifesto = {
      capabilities: ['test'],
      permission_scopes: ['thread:read'],
      available_tools: ['search'],
    }
    const entity = createMockEntity(declareCapabilityManifesto({
      capabilities: ['test'],
      permission_scopes: ['thread:read'],
      available_tools: ['search'],
    }))
    const model = createMockModel(new Map([['*', { text: 'Hello' }]]))

    const runtime = createEntityRuntime({
      entity,
      model,
      manifesto: storedManifesto,
    })
    expect(runtime.getEntityId()).toBe(ENTITY_ID)
    expect(runtime.getManifesto().capabilities).toContain('test')
  })

  it('无效 manifesto 抛出错误', () => {
    const entity = createMockEntity(declareCapabilityManifesto())
    const model = createMockModel(new Map([['*', { text: 'X' }]]))

    expect(() => createEntityRuntime({
      entity,
      model,
      manifesto: { capabilities: 42 } as unknown as CapabilityManifesto,
    })).toThrow(/Invalid entity manifesto/)
  })
})

describe('EntityRuntime - 流式对话', () => {
  it('streamChat 调用 onToken 回调', async () => {
    const manifesto = declareCapabilityManifesto({ capabilities: ['general'] })
    const entity = createMockEntity(manifesto)
    const model = createMockModel(new Map([['*', { text: 'Hello' }]]))
    const runtime = new EntityRuntime({ entity, model, manifesto })
    const mockDb = createMockDb()

    const tokens: string[] = []
    const result = await runtime.streamChat(mockDb as unknown as AuditDb, REALM_ID, [
      { role: 'user', content: 'Hi' },
    ], undefined, {
      onToken: (t) => tokens.push(t),
    })
    expect(result.reply).toBe('Hello')
    expect(tokens.length).toBeGreaterThan(0)
  })
})
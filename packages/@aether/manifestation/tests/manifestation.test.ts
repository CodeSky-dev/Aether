// @aether/manifestation · Manifestation Binding 单元测试
import { describe, it, expect, vi } from 'vitest'
import {
  bindManifestation,
  getManifestation,
  unbindManifestation,
  listManifestationsByThread,
} from '../src/manifestation.js'

function createMockDb(initialRows: Array<{
  id: string
  realm_id: string
  manifestation_url: string | null
}>) {
  let rows = [...initialRows]
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          url: null as string | null,
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((updates: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => {
            // Find and update matching row
            return rows.filter((r) => {
              return true
            }).map((r) => ({
              ...r,
              ...updates,
            }))
          }),
        })),
      })),
    })),
  }
}

describe('bindManifestation', () => {
  it('为 Thread 设置 manifestation_url', async () => {
    let store: Record<string, { url: string | null }> = {
      't1': { url: null },
    }

    const mockDb: any = {
      update: vi.fn(() => ({
        set: vi.fn((updates: Record<string, unknown>) => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => {
              store['t1'] = { url: updates.manifestation_url as string }
              return [{ id: 't1', manifestation_url: updates.manifestation_url }]
            }),
          })),
        })),
      })),
    }

    const result = await bindManifestation(mockDb, {
      realmId: 'r1',
      threadId: 't1',
      url: 'https://ai-generated.dev/snippet/123',
      kind: 'code-snippet',
      version: 'v1',
    })

    expect(result).not.toBeNull()
    expect(result?.manifestation_url).toBe('https://ai-generated.dev/snippet/123')
  })
})

describe('getManifestation', () => {
  it('返回 Thread 绑定的 URL', async () => {
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([{ url: 'https://example.com/doc' }])),
        })),
      })),
    }

    const url = await getManifestation(mockDb, 'r1', 't1')
    expect(url).toBe('https://example.com/doc')
  })

  it('未绑定时返回 null', async () => {
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([])),
        })),
      })),
    }

    const url = await getManifestation(mockDb, 'r1', 't1')
    expect(url).toBeNull()
  })
})

describe('unbindManifestation', () => {
  it('清除 manifestation_url', async () => {
    const mockDb: any = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => [{ id: 't1', manifestation_url: null }]),
          })),
        })),
      })),
    }

    const result = await unbindManifestation(mockDb, 'r1', 't1')
    expect(result?.manifestation_url).toBeNull()
  })
})

describe('listManifestationsByThread', () => {
  it('返回当前绑定的 URL', async () => {
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([{ url: 'https://example.com' }])),
        })),
      })),
    }

    const urls = await listManifestationsByThread(mockDb, 'r1', 't1')
    expect(urls).toEqual(['https://example.com'])
  })

  it('未绑定时返回空数组', async () => {
    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([])),
        })),
      })),
    }

    const urls = await listManifestationsByThread(mockDb, 'r1', 't1')
    expect(urls).toEqual([])
  })
})
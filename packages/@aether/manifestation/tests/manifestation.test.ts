// @aether/manifestation · Manifestation Binding 单元测试
import { describe, it, expect, vi } from 'vitest'
import {
  bindManifestation,
  getManifestation,
  unbindManifestation,
  listManifestationsByThread,
  type ManifestationDb,
} from '../src/manifestation.js'

describe('bindManifestation', () => {
  it('为 Thread 设置 manifestation_url', async () => {
    const store: Record<string, { url: string | null }> = {
      't1': { url: null },
    }

    const mockDb = {
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
    } as unknown as ManifestationDb

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
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([{ url: 'https://example.com/doc' }])),
        })),
      })),
    } as unknown as ManifestationDb

    const url = await getManifestation(mockDb, 'r1', 't1')
    expect(url).toBe('https://example.com/doc')
  })

  it('未绑定时返回 null', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([])),
        })),
      })),
    } as unknown as ManifestationDb

    const url = await getManifestation(mockDb, 'r1', 't1')
    expect(url).toBeNull()
  })
})

describe('unbindManifestation', () => {
  it('清除 manifestation_url', async () => {
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => [{ id: 't1', manifestation_url: null }]),
          })),
        })),
      })),
    } as unknown as ManifestationDb

    const result = await unbindManifestation(mockDb, 'r1', 't1')
    expect(result?.manifestation_url).toBeNull()
  })
})

describe('listManifestationsByThread', () => {
  it('返回当前绑定的 URL', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([{ url: 'https://example.com' }])),
        })),
      })),
    } as unknown as ManifestationDb

    const urls = await listManifestationsByThread(mockDb, 'r1', 't1')
    expect(urls).toEqual(['https://example.com'])
  })

  it('未绑定时返回空数组', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ([])),
        })),
      })),
    } as unknown as ManifestationDb

    const urls = await listManifestationsByThread(mockDb, 'r1', 't1')
    expect(urls).toEqual([])
  })
})
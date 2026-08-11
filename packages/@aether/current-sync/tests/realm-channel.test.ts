import { describe, expect, it } from 'vitest'
import { RealmChannelRegistry } from '../src/index.js'

describe('RealmChannelRegistry', () => {
  it('隔离不同 Realm 的同名频道，并拒绝错误 Realm 的访问', () => {
    const registry = new RealmChannelRegistry()
    const first = registry.open('realm-a', 'current')
    const second = registry.open('realm-b', 'current')

    expect(first.doc).not.toBe(second.doc)
    expect(registry.open('realm-a', 'current')).toBe(first)
    expect(() => registry.get(first, 'realm-b')).toThrow('Realm mismatch')

    registry.destroyAll()
  })

  it('释放频道后不复用旧 Y.Doc', () => {
    const registry = new RealmChannelRegistry()
    const first = registry.open('realm-a', 'current')
    registry.destroy(first)

    expect(registry.size).toBe(0)
    expect(() => registry.get(first)).toThrow('not registered')
    const second = registry.open('realm-a', 'current')
    expect(second).not.toBe(first)
    expect(second.doc).not.toBe(first.doc)
    registry.destroyAll()
  })
})

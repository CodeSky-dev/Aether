// @aether/entity-core · Entity Presence Cursor 单元测试
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as Y from 'yjs'
import { EntityPresenceCursor } from '../src/presence.js'
import { PresenceChannel } from '@aether/current-sync'

const ENTITY_ID = 'ent-presence-001'

afterEach(() => {
  vi.useRealTimers()
})

describe('EntityPresenceCursor.create', () => {
  it('内部创建 PresenceChannel，setCursor 写入光标', () => {
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, {
      entityId: ENTITY_ID,
      heartbeatMs: 10_000,
    })
    cursor.setCursor({ file: 'src/index.ts', offset: 42 })

    expect(cursor.getLocalCursor()).toEqual({
      file: 'src/index.ts',
      offset: 42,
    })
    expect(cursor.getEntityId()).toBe(ENTITY_ID)
    expect(cursor.getChannel()).toBeInstanceOf(PresenceChannel)
    cursor.destroy()
    doc.destroy()
  })

  it('setCursor(null) 清除光标但保持在场', () => {
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, { entityId: ENTITY_ID })
    cursor.setCursor({ file: 'a.ts', offset: 0 })
    expect(cursor.getLocalCursor()).not.toBeNull()

    cursor.setCursor(null)
    expect(cursor.getLocalCursor()).toBeNull()
    cursor.destroy()
    doc.destroy()
  })

  it('refresh 刷新在场状态', () => {
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, { entityId: ENTITY_ID })
    // 未设置 presence 时 refresh 返回 false
    expect(cursor.refresh()).toBe(false)
    cursor.setCursor({ file: 'a.ts', offset: 0 })
    // 设置 presence 后 refresh 返回 true
    expect(cursor.refresh()).toBe(true)
    cursor.destroy()
    doc.destroy()
  })

  it('clearPresence 清除光标并停止心跳', () => {
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, { entityId: ENTITY_ID })
    cursor.setCursor({ file: 'a.ts', offset: 0 })
    cursor.clearPresence()
    expect(cursor.getLocalCursor()).toBeNull()
    // clearPresence 后 refresh 返回 false（无 presence）
    expect(cursor.refresh()).toBe(false)
    cursor.destroy()
    doc.destroy()
  })

  it('destroy 销毁内部 channel', () => {
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, { entityId: ENTITY_ID })
    const channel = cursor.getChannel()
    cursor.setCursor({ file: 'a.ts', offset: 0 })
    cursor.destroy()
    // channel 被销毁后，awareness 应已清理
    expect(() => channel.getSnapshots()).not.toThrow()
    doc.destroy()
  })
})

describe('EntityPresenceCursor.wrap', () => {
  it('包装已存在的 PresenceChannel（不拥有生命周期）', () => {
    const doc = new Y.Doc()
    const channel = new PresenceChannel(doc, { actorId: ENTITY_ID })
    const cursor = EntityPresenceCursor.wrap(channel, { entityId: ENTITY_ID })

    cursor.setCursor({ file: 'b.ts', offset: 10 })
    expect(cursor.getChannel()).toBe(channel)
    expect(cursor.getLocalCursor()).toEqual({ file: 'b.ts', offset: 10 })

    // destroy 不销毁 channel，只清 presence
    cursor.destroy()
    // channel 仍可用
    expect(() => channel.getSnapshots()).not.toThrow()
    channel.destroy()
    doc.destroy()
  })

  it('wrap 后 setCursor 与 channel.subscribe 联动', () => {
    const doc = new Y.Doc()
    const channel = new PresenceChannel(doc, { actorId: ENTITY_ID })
    const cursor = EntityPresenceCursor.wrap(channel, { entityId: ENTITY_ID })

    const snapshots = channel.getSnapshots()
    cursor.setCursor({ file: 'c.ts', offset: 5 })

    // channel 的 snapshots 应包含本 Entity
    const updated = channel.getSnapshots()
    expect(updated.length).toBeGreaterThanOrEqual(snapshots.length)
    const selfSnapshot = updated.find((s) => s.actorId === ENTITY_ID)
    expect(selfSnapshot).toBeDefined()
    expect(selfSnapshot!.cursor).toEqual({ file: 'c.ts', offset: 5 })

    cursor.destroy()
    channel.destroy()
    doc.destroy()
  })
})

describe('EntityPresenceCursor - heartbeat', () => {
  it('心跳定时刷新 presence', () => {
    vi.useFakeTimers()
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, {
      entityId: ENTITY_ID,
      heartbeatMs: 1_000,
    })
    cursor.setCursor({ file: 'a.ts', offset: 0 })

    const refreshSpy = vi.spyOn(cursor.getChannel(), 'refreshLocalPresence')
    // 推进 2 秒，应触发 2 次心跳
    vi.advanceTimersByTime(2_000)
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2)

    cursor.destroy()
    doc.destroy()
  })

  it('clearPresence 后心跳停止', () => {
    vi.useFakeTimers()
    const doc = new Y.Doc()
    const cursor = EntityPresenceCursor.create(doc, {
      entityId: ENTITY_ID,
      heartbeatMs: 1_000,
    })
    cursor.setCursor({ file: 'a.ts', offset: 0 })
    const refreshSpy = vi.spyOn(cursor.getChannel(), 'refreshLocalPresence')

    cursor.clearPresence()
    refreshSpy.mockClear()
    vi.advanceTimersByTime(3_000)
    expect(refreshSpy).not.toHaveBeenCalled()

    cursor.destroy()
    doc.destroy()
  })
})

import { describe, expect, it } from 'vitest'
import { runServerlessProbe } from '../probes/serverless.js'

describe('@aether/editor-host serverless probe', () => {
  it('验证无状态持久化与增量对账的正确性', async () => {
    const result = await runServerlessProbe({
      persistenceEditCount: 100,
      latencyEditCounts: [100],
      coldStartRequestCount: 10,
    })
    expect(result.persistence.appendUpdates).toHaveLength(3)
    expect(result.persistence.fullSnapshot.store.writes).toBe(100)
    expect(result.reconnect.diffUpdateBytes).toBeLessThanOrEqual(
      result.reconnect.fullSnapshotBytes,
    )
    expect(result.reconnect.convergedContentSuffix).toContain('编辑-99;')
  })

  it('验证无状态 Presence 重连后由 replayLocalPresence 自动恢复', async () => {
    const result = await runServerlessProbe({
      persistenceEditCount: 10,
      latencyEditCounts: [10],
      coldStartRequestCount: 2,
    })
    expect(result.presence.seenBeforeDisconnect).toContain('probe-client')
    expect(result.presence.withoutReplay).toContain('probe-client')
    expect(result.presence.afterClientReplay).toContain('probe-client')
    expect(result.presence.requiresClientReplay).toBe(false)
  })
})

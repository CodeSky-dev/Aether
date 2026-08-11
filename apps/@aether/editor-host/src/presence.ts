// @aether/editor-host · Presence 通道。
import type { PresenceSnapshot } from '@aether/types'
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness'
import type * as Y from 'yjs'

export interface PresenceOptions {
  actorId: string
  timeoutMs?: number
  now?: () => number
}

export type PresenceChangeListener = (
  snapshots: readonly PresenceSnapshot[],
) => void

export class PresenceChannel {
  private readonly awareness: Awareness
  private readonly actorId: string
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly listeners = new Set<PresenceChangeListener>()
  private readonly sweepTimer: ReturnType<typeof setInterval>

  public constructor(doc: Y.Doc, options: PresenceOptions) {
    this.awareness = new Awareness(doc)
    this.actorId = options.actorId
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.now = options.now ?? Date.now
    this.awareness.on('change', this.handleAwarenessChange)
    const sweepTimer = setInterval(
      () => this.sweepExpired(),
      Math.max(1, Math.min(this.timeoutMs, 1_000)),
    )
    if (
      typeof sweepTimer === 'object' &&
      sweepTimer !== null &&
      'unref' in sweepTimer &&
      typeof sweepTimer.unref === 'function'
    ) {
      sweepTimer.unref()
    }
    this.sweepTimer = sweepTimer
  }

  public setLocalPresence(
    presence: Pick<PresenceSnapshot, 'cursor' | 'selection'>,
  ): void {
    this.awareness.setLocalState({
      actorId: this.actorId,
      cursor: presence.cursor,
      selection: presence.selection,
      lastSeenAt: this.now(),
    })
  }

  public clearLocalPresence(): void {
    this.awareness.setLocalState(null)
  }

  public encodeUpdate(clientIds?: number[]): Uint8Array {
    return encodeAwarenessUpdate(
      this.awareness,
      clientIds ?? Array.from(this.awareness.getStates().keys()),
    )
  }

  public applyUpdate(update: Uint8Array, origin: symbol): void {
    applyAwarenessUpdate(this.awareness, update, origin)
    this.sweepExpired()
  }

  public subscribe(listener: PresenceChangeListener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshots())
    return () => this.listeners.delete(listener)
  }

  public getSnapshots(): PresenceSnapshot[] {
    this.sweepExpired()
    return Array.from(this.awareness.getStates().values())
      .map((state) => this.toSnapshot(state))
      .filter((snapshot): snapshot is PresenceSnapshot => snapshot !== null)
  }

  public sweepExpired(): void {
    const expiredClientIds = Array.from(this.awareness.getStates()).flatMap(
      ([clientId, state]) => {
        const snapshot = this.toSnapshot(state)
        return snapshot && this.now() - snapshot.lastSeenAt > this.timeoutMs
          ? [clientId]
          : []
      },
    )
    if (expiredClientIds.length > 0) {
      removeAwarenessStates(this.awareness, expiredClientIds, this)
    }
  }

  public destroy(): void {
    clearInterval(this.sweepTimer)
    this.awareness.off('change', this.handleAwarenessChange)
    this.awareness.destroy()
    this.listeners.clear()
  }

  public getLocalClientId(): number {
    return this.awareness.clientID
  }

  private readonly handleAwarenessChange = (): void => {
    const snapshots = this.getSnapshots()
    for (const listener of this.listeners) {
      listener(snapshots)
    }
  }

  private toSnapshot(state: unknown): PresenceSnapshot | null {
    if (!state || typeof state !== 'object') {
      return null
    }
    const value = state as Partial<PresenceSnapshot>
    if (
      typeof value.actorId !== 'string' ||
      typeof value.lastSeenAt !== 'number' ||
      (value.cursor !== null && typeof value.cursor !== 'object') ||
      (value.selection !== null && typeof value.selection !== 'object')
    ) {
      return null
    }
    return {
      actorId: value.actorId,
      cursor: value.cursor ?? null,
      selection: value.selection ?? null,
      lastSeenAt: value.lastSeenAt,
    }
  }
}

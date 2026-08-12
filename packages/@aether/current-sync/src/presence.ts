// @aether/current-sync · Presence 通道。
import type { PresenceSnapshot } from '@aether/types'
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
  modifyAwarenessUpdate,
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
  private readonly sessionId: string
  private readonly timeoutMs: number
  private readonly now: () => number
  private readonly listeners = new Set<PresenceChangeListener>()
  private readonly sweepTimer: ReturnType<typeof setInterval>
  private readonly knownSequences = new Map<
    string,
    { sequence: number; lastSeenAt: number }
  >()
  private localSequence = 0
  private localPresence: Pick<
    PresenceSnapshot,
    'cursor' | 'selection'
  > | null = null

  public constructor(doc: Y.Doc, options: PresenceOptions) {
    this.awareness = new Awareness(doc)
    this.actorId = options.actorId
    this.sessionId = String(this.awareness.clientID)
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
    this.localPresence = presence
    this.localSequence += 1
    this.knownSequences.set(this.sessionId, {
      sequence: this.localSequence,
      lastSeenAt: this.now(),
    })
    this.awareness.setLocalState({
      actorId: this.actorId,
      sessionId: this.sessionId,
      cursor: presence.cursor,
      selection: presence.selection,
      lastSeenAt: this.now(),
      sequence: this.localSequence,
    })
  }

  public refreshLocalPresence(): boolean {
    if (!this.localPresence) {
      return false
    }
    this.setLocalPresence(this.localPresence)
    return true
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
    const filteredUpdate = modifyAwarenessUpdate(update, (state) => {
      const rawState: unknown = state
      if (!rawState || typeof rawState !== 'object') {
        return rawState
      }
      const value = rawState as Partial<PresenceSnapshot>
      if (
        typeof value.actorId !== 'string' ||
        typeof value.sequence !== 'number'
      ) {
        return rawState
      }
      const sessionId = this.getSessionId(value)
      const knownRecord = this.knownSequences.get(sessionId)
      if (
        knownRecord === undefined ||
        value.sequence > knownRecord.sequence
      ) {
        return rawState
      }
      return this.findStateBySessionId(sessionId)
    })
    applyAwarenessUpdate(this.awareness, filteredUpdate, origin)
    this.pruneKnownSequences()
    for (const state of this.awareness.getStates().values()) {
      if (
        state &&
        typeof state === 'object' &&
        typeof state.actorId === 'string' &&
        typeof state.sequence === 'number'
      ) {
        const sessionId = this.getSessionId(state)
        const existing = this.knownSequences.get(sessionId)
        this.knownSequences.set(sessionId, {
          sequence: Math.max(existing?.sequence ?? 0, state.sequence),
          lastSeenAt: Math.max(
            existing?.lastSeenAt ?? 0,
            typeof state.lastSeenAt === 'number' ? state.lastSeenAt : 0,
            this.now(),
          ),
        })
      }
    }
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
        if (snapshot && this.now() - snapshot.lastSeenAt > this.timeoutMs) {
          return [clientId]
        }
        return []
      },
    )
    if (expiredClientIds.length > 0) {
      removeAwarenessStates(this.awareness, expiredClientIds, this)
    }
    this.pruneKnownSequences()
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
      ...(typeof value.sessionId === 'string'
        ? { sessionId: value.sessionId }
        : {}),
      cursor: value.cursor ?? null,
      selection: value.selection ?? null,
      lastSeenAt: value.lastSeenAt,
      ...(typeof value.sequence === 'number'
        ? { sequence: value.sequence }
        : {}),
    }
  }

  private findStateBySessionId(sessionId: string): unknown {
    for (const state of this.awareness.getStates().values()) {
      if (
        state &&
        typeof state === 'object' &&
        this.getSessionId(state) === sessionId
      ) {
        return state
      }
    }
    return null
  }

  private getSessionId(state: Partial<PresenceSnapshot>): string {
    return state.sessionId ?? state.actorId ?? ''
  }

  private pruneKnownSequences(): void {
    const now = this.now()
    const activeSessions = new Set<string>()
    for (const state of this.awareness.getStates().values()) {
      if (state && typeof state === 'object') {
        activeSessions.add(this.getSessionId(state))
      }
    }
    for (const [sessionId, record] of this.knownSequences) {
      if (activeSessions.has(sessionId)) {
        continue
      }
      if (now - record.lastSeenAt > this.timeoutMs) {
        this.knownSequences.delete(sessionId)
      }
    }
  }
}

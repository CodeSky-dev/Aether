// @aether/current-sync · 传输无关的 Yjs Provider 基线。
import type { PresenceSnapshot, YDocPartitionKey } from '@aether/types'
import { CRDT_SCHEMA_VERSION } from '@aether/types'
import { PresenceChannel, type PresenceOptions } from './presence.js'
import {
  applyDocUpdate,
  createDoc,
  destroyDoc,
  diffDocUpdate,
  encodeDocStateVector,
  encodeDocUpdate,
  getPartition,
  subscribeDocUpdates,
} from './yjs-adapter.js'
import {
  deserializeStateVector,
  deserializeUpdate,
  serializeStateVector,
  serializeUpdate,
} from './serialization.js'
import type { ProviderMessage, ProviderTransport } from './transport.js'
import type * as Y from 'yjs'

export type ProviderConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'

export interface ProviderOptions extends PresenceOptions {
  transport: ProviderTransport
  doc?: Y.Doc
  handshakeTimeoutMs?: number
  presenceThrottleMs?: number
  presenceHeartbeatMs?: number
}

export type ConnectionStateListener = (
  state: ProviderConnectionState,
) => void

const REMOTE_ORIGIN = Symbol('remote-update')
const HANDSHAKE_ERROR = 'Provider handshake was interrupted'
const DEFAULT_PRESENCE_THROTTLE_MS = 50
const DEFAULT_PRESENCE_TIMEOUT_MS = 30_000

type LocalPresence = Pick<PresenceSnapshot, 'cursor' | 'selection'>

interface PendingHandshake {
  requestId: string
  resolve: () => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
}

export class YjsProvider {
  public readonly doc: Y.Doc
  public readonly presence: PresenceChannel
  public readonly schemaVersion = CRDT_SCHEMA_VERSION
  private state: ProviderConnectionState = 'disconnected'
  private readonly stateListeners = new Set<ConnectionStateListener>()
  private readonly transport: ProviderTransport
  private readonly stopDocUpdates: () => void
  private readonly handshakeTimeoutMs: number
  private readonly presenceThrottleMs: number
  private readonly presenceHeartbeatMs: number
  private readonly respondedHandshakeRequests = new Set<string>()
  private pendingHandshake: PendingHandshake | null = null
  private connectionPromise: Promise<void> | null = null
  private handshakeSequence = 0
  private localPresence: LocalPresence | null = null
  private transportConnected = false
  private presenceWindowTimer: ReturnType<typeof setTimeout> | null = null
  private presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null
  private presenceBroadcastPending = false

  public constructor(options: ProviderOptions) {
    if (
      options.handshakeTimeoutMs !== undefined &&
      (!Number.isFinite(options.handshakeTimeoutMs) ||
        options.handshakeTimeoutMs <= 0)
    ) {
      throw new Error('handshakeTimeoutMs must be a positive number')
    }
    const presenceTimeoutMs = options.timeoutMs ?? DEFAULT_PRESENCE_TIMEOUT_MS
    const presenceHeartbeatMs =
      options.presenceHeartbeatMs ?? Math.max(1, Math.floor(presenceTimeoutMs / 3))
    if (
      options.presenceThrottleMs !== undefined &&
      (!Number.isFinite(options.presenceThrottleMs) ||
        options.presenceThrottleMs <= 0)
    ) {
      throw new Error('presenceThrottleMs must be a positive number')
    }
    if (
      !Number.isFinite(presenceHeartbeatMs) ||
      presenceHeartbeatMs <= 0 ||
      presenceHeartbeatMs >= presenceTimeoutMs
    ) {
      throw new Error(
        'presenceHeartbeatMs must be positive and less than timeoutMs',
      )
    }
    this.doc = options.doc ?? createDoc()
    this.transport = options.transport
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000
    this.presenceThrottleMs =
      options.presenceThrottleMs ?? DEFAULT_PRESENCE_THROTTLE_MS
    this.presenceHeartbeatMs = presenceHeartbeatMs
    this.presence = new PresenceChannel(this.doc, options)
    this.stopDocUpdates = subscribeDocUpdates(this.doc, (update, origin) => {
      if (this.state === 'connected' && origin !== REMOTE_ORIGIN) {
        this.transport.send({ kind: 'document', payload: update })
      }
    })
  }

  public get connectionState(): ProviderConnectionState {
    return this.state
  }

  public async connect(): Promise<void> {
    if (this.state === 'connected') {
      return
    }
    if (this.state === 'connecting') {
      await this.connectionPromise
      return
    }
    this.setState('connecting')
    this.respondedHandshakeRequests.clear()
    const requestId = this.createHandshakeRequestId()
    let resolveHandshake: () => void = () => {}
    let rejectHandshake: (error: unknown) => void = () => {}
    const connectionPromise = new Promise<void>((resolve, reject) => {
      resolveHandshake = resolve
      rejectHandshake = reject
    })
    const pendingHandshake: PendingHandshake = {
      requestId,
      resolve: resolveHandshake,
      reject: rejectHandshake,
      timer: null,
    }
    this.pendingHandshake = pendingHandshake
    this.connectionPromise = connectionPromise
    pendingHandshake.timer = this.scheduleHandshakeTimeout(requestId)
    this.transportConnected = true

    try {
      await this.transport.connect(this.handleMessage)
      if (this.pendingHandshake?.requestId !== requestId) {
        await connectionPromise
        return
      }
      this.transport.send({
        kind: 'sync-state-vector',
        requestId,
        payload: serializeStateVector(encodeDocStateVector(this.doc)),
      })
    } catch (error) {
      this.failHandshake(error)
      this.setState('disconnected')
      return connectionPromise
    }

    await connectionPromise
  }

  public async reconnect(): Promise<void> {
    this.disconnect()
    await this.connect()
  }

  public disconnect(): void {
    if (this.state === 'disconnected') {
      this.clearPresenceTimers()
      return
    }
    const shouldSendPresenceRemoval =
      this.state === 'connected' && this.transportConnected
    this.failHandshake(new Error(HANDSHAKE_ERROR))
    this.clearPresenceTimers()
    this.presence.clearLocalPresence()
    if (shouldSendPresenceRemoval) {
      this.transport.send({
        kind: 'presence',
        payload: this.presence.encodeUpdate([this.presence.getLocalClientId()]),
      })
    }
    this.transportConnected = false
    this.transport.disconnect()
    this.respondedHandshakeRequests.clear()
    this.setState('disconnected')
  }

  public getPartition<T extends YDocPartitionKey>(
    key: T,
  ): Y.Map<unknown> {
    return getPartition(this.doc, key)
  }

  public setLocalPresence(
    presence: Pick<PresenceSnapshot, 'cursor' | 'selection'>,
  ): void {
    this.localPresence = presence
    this.presence.setLocalPresence(presence)
    if (this.state !== 'connected' || !this.transportConnected) {
      return
    }
    const windowOpen = this.presenceWindowTimer !== null
    if (!windowOpen) {
      this.broadcastPresence()
      this.presenceWindowTimer = this.schedulePresenceWindow()
    }
    if (windowOpen) {
      this.presenceBroadcastPending = true
    }
    this.startPresenceHeartbeat()
  }

  public subscribeConnectionState(
    listener: ConnectionStateListener,
  ): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  public subscribePresence(
    listener: (snapshots: readonly PresenceSnapshot[]) => void,
  ): () => void {
    return this.presence.subscribe(listener)
  }

  public destroy(): void {
    this.disconnect()
    this.stopDocUpdates()
    this.presence.destroy()
    destroyDoc(this.doc)
  }

  private readonly handleMessage = (message: ProviderMessage): void => {
    if (message.kind === 'document') {
      applyDocUpdate(this.doc, message.payload, REMOTE_ORIGIN)
      return
    }
    if (message.kind === 'presence') {
      this.presence.applyUpdate(message.payload, REMOTE_ORIGIN)
      return
    }
    if (message.kind === 'sync-state-vector') {
      this.respondToStateVector(message)
      return
    }
    if (!this.transportConnected) {
      return
    }
    const update = deserializeUpdate(message.payload)
    applyDocUpdate(this.doc, update, REMOTE_ORIGIN)
    if (message.stage === 'final') {
      return
    }
    if (this.pendingHandshake?.requestId === message.requestId) {
      const peerStateVector = deserializeStateVector(message.stateVector)
      const missingUpdate = diffDocUpdate(
        encodeDocUpdate(this.doc),
        peerStateVector,
      )
      this.transport.send({
        kind: 'sync-update',
        requestId: message.requestId,
        stage: 'final',
        payload: serializeUpdate(missingUpdate),
      })
      this.completeHandshake()
    }
  }

  private respondToStateVector(
    message: Extract<ProviderMessage, { kind: 'sync-state-vector' }>,
  ): void {
    if (
      !this.transportConnected ||
      this.respondedHandshakeRequests.has(message.requestId)
    ) {
      return
    }
    this.respondedHandshakeRequests.add(message.requestId)
    const stateVector = deserializeStateVector(message.payload)
    const update = diffDocUpdate(encodeDocUpdate(this.doc), stateVector)
    this.transport.send({
      kind: 'sync-update',
      requestId: message.requestId,
      stage: 'response',
      payload: serializeUpdate(update),
      stateVector: serializeStateVector(encodeDocStateVector(this.doc)),
    })
  }

  private completeHandshake(): void {
    const pending = this.pendingHandshake
    if (!pending) {
      return
    }
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    this.pendingHandshake = null
    this.connectionPromise = null
    this.setState('connected')
    this.replayLocalPresence()
    pending.resolve()
  }

  private failHandshake(error: unknown): void {
    const pending = this.pendingHandshake
    if (pending?.timer) {
      clearTimeout(pending.timer)
    }
    this.pendingHandshake = null
    this.connectionPromise = null
    if (pending) {
      pending.reject(error)
    }
  }

  private scheduleHandshakeTimeout(
    requestId: string,
  ): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      if (this.pendingHandshake?.requestId !== requestId) {
        return
      }
      this.transportConnected = false
      this.transport.disconnect()
      this.failHandshake(
        new Error(
          `Provider handshake timed out after ${this.handshakeTimeoutMs}ms`,
        ),
      )
      this.setState('disconnected')
    }, this.handshakeTimeoutMs)
    if (
      typeof timer === 'object' &&
      timer !== null &&
      'unref' in timer &&
      typeof timer.unref === 'function'
    ) {
      timer.unref()
    }
    return timer
  }

  private replayLocalPresence(): void {
    if (!this.localPresence) {
      return
    }
    this.presence.refreshLocalPresence()
    this.broadcastPresence()
    this.startPresenceHeartbeat()
  }

  private broadcastPresence(): void {
    if (this.state !== 'connected' || !this.transportConnected) {
      return
    }
    this.transport.send({
      kind: 'presence',
      payload: this.presence.encodeUpdate([this.presence.getLocalClientId()]),
    })
  }

  private schedulePresenceWindow(): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.presenceWindowTimer = null
      if (this.presenceBroadcastPending) {
        this.presenceBroadcastPending = false
        this.broadcastPresence()
        this.presenceWindowTimer = this.schedulePresenceWindow()
      }
    }, this.presenceThrottleMs)
    this.unrefTimer(timer)
    return timer
  }

  private startPresenceHeartbeat(): void {
    this.clearPresenceHeartbeat()
    this.presenceHeartbeatTimer = setInterval(() => {
      if (
        this.state !== 'connected' ||
        !this.transportConnected ||
        this.presenceWindowTimer !== null ||
        !this.localPresence
      ) {
        return
      }
      if (this.presence.refreshLocalPresence()) {
        this.broadcastPresence()
      }
    }, this.presenceHeartbeatMs)
    this.unrefTimer(this.presenceHeartbeatTimer)
  }

  private clearPresenceTimers(): void {
    if (this.presenceWindowTimer) {
      clearTimeout(this.presenceWindowTimer)
      this.presenceWindowTimer = null
    }
    this.clearPresenceHeartbeat()
    this.presenceBroadcastPending = false
  }

  private clearPresenceHeartbeat(): void {
    if (this.presenceHeartbeatTimer) {
      clearInterval(this.presenceHeartbeatTimer)
      this.presenceHeartbeatTimer = null
    }
  }

  private unrefTimer(timer: ReturnType<typeof setTimeout>): void {
    if (
      typeof timer === 'object' &&
      timer !== null &&
      'unref' in timer &&
      typeof timer.unref === 'function'
    ) {
      timer.unref()
    }
  }

  private createHandshakeRequestId(): string {
    this.handshakeSequence += 1
    return `${this.doc.clientID}:${this.handshakeSequence}`
  }

  private setState(state: ProviderConnectionState): void {
    this.state = state
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}

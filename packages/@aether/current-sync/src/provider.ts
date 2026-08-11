// @aether/current-sync · 传输无关的 Yjs Provider 基线。
import type { PresenceSnapshot, YDocPartitionKey } from '@aether/types'
import { CRDT_SCHEMA_VERSION } from '@aether/types'
import { PresenceChannel, type PresenceOptions } from './presence.js'
import {
  applyDocUpdate,
  createDoc,
  destroyDoc,
  encodeDocUpdate,
  getPartition,
  subscribeDocUpdates,
} from './yjs-adapter.js'
import type { ProviderMessage, ProviderTransport } from './transport.js'
import type * as Y from 'yjs'

export type ProviderConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'

export interface ProviderOptions extends PresenceOptions {
  transport: ProviderTransport
  doc?: Y.Doc
}

export type ConnectionStateListener = (
  state: ProviderConnectionState,
) => void

const REMOTE_ORIGIN = Symbol('remote-update')

export class YjsProvider {
  public readonly doc: Y.Doc
  public readonly presence: PresenceChannel
  public readonly schemaVersion = CRDT_SCHEMA_VERSION
  private state: ProviderConnectionState = 'disconnected'
  private readonly stateListeners = new Set<ConnectionStateListener>()
  private readonly transport: ProviderTransport
  private readonly stopDocUpdates: () => void

  public constructor(options: ProviderOptions) {
    this.doc = options.doc ?? createDoc()
    this.transport = options.transport
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
    if (this.state !== 'disconnected') {
      return
    }
    this.setState('connecting')
    await this.transport.connect(this.handleMessage)
    this.transport.send({ kind: 'document', payload: encodeDocUpdate(this.doc) })
    this.transport.send({ kind: 'presence', payload: this.presence.encodeUpdate() })
    this.setState('connected')
  }

  public disconnect(): void {
    if (this.state === 'disconnected') {
      return
    }
    this.presence.clearLocalPresence()
    this.transport.send({
      kind: 'presence',
      payload: this.presence.encodeUpdate([this.presence.getLocalClientId()]),
    })
    this.transport.disconnect()
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
    this.presence.setLocalPresence(presence)
    if (this.state === 'connected') {
      this.transport.send({
        kind: 'presence',
        payload: this.presence.encodeUpdate(),
      })
    }
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
    } else {
      this.presence.applyUpdate(message.payload, REMOTE_ORIGIN)
    }
  }

  private setState(state: ProviderConnectionState): void {
    this.state = state
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }
}

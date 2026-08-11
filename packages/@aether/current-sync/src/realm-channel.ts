// @aether/current-sync · Realm Channel Partition 注册表。
import type { YDocPartitionKey } from '@aether/types'
import {
  appendPartitionText,
  createDoc,
  destroyDoc,
  getPartition,
  readPartitionField,
  readPartitionFieldCommittedAt,
  readPartitionText,
  writePartitionField,
  writePartitionFieldCommittedAt,
} from './yjs-adapter.js'
import type * as Y from 'yjs'

export interface RealmChannelRef {
  readonly channelId: string
  readonly realmId: string
  readonly docRef: string
}

export interface RealmChannel extends RealmChannelRef {
  readonly doc: Y.Doc
  getPartition<T extends YDocPartitionKey>(key: T): Y.Map<unknown>
  appendPartitionText<T extends YDocPartitionKey>(
    key: T,
    field: string,
    value: string,
  ): void
  readPartitionText<T extends YDocPartitionKey>(
    key: T,
    field: string,
  ): string
  readField<T extends YDocPartitionKey>(
    key: T,
    field: string,
  ): unknown
  writeField<T extends YDocPartitionKey>(
    key: T,
    field: string,
    value: unknown,
  ): void
  readFieldCommittedAt<T extends YDocPartitionKey>(
    key: T,
    field: string,
  ): number | null
  writeFieldCommittedAt<T extends YDocPartitionKey>(
    key: T,
    field: string,
    committedAt: number,
  ): void
}

interface ChannelEntry {
  readonly ref: RealmChannelRef
  readonly channel: RealmChannel
}

function requireIdentifier(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} cannot be empty`)
  }
}

function deriveChannelId(realmId: string, docRef: string): string {
  return `realm:${encodeURIComponent(realmId)}:doc:${encodeURIComponent(docRef)}`
}

export class RealmChannelRegistry {
  private readonly channels = new Map<string, ChannelEntry>()

  public open(realmId: string, docRef: string): RealmChannel {
    requireIdentifier(realmId, 'realmId')
    requireIdentifier(docRef, 'docRef')
    const channelId = deriveChannelId(realmId, docRef)
    const existing = this.channels.get(channelId)
    if (existing) {
      return existing.channel
    }

    const ref: RealmChannelRef = { channelId, realmId, docRef }
    const doc = createDoc()
    const channel: RealmChannel = {
      ...ref,
      doc,
      getPartition: (key) => getPartition(doc, key),
      appendPartitionText: (key, field, value) =>
        appendPartitionText(doc, key, field, value),
      readPartitionText: (key, field) => readPartitionText(doc, key, field),
      readField: (key, field) => readPartitionField(doc, key, field),
      writeField: (key, field, value) =>
        writePartitionField(doc, key, field, value),
      readFieldCommittedAt: (key, field) =>
        readPartitionFieldCommittedAt(doc, key, field),
      writeFieldCommittedAt: (key, field, committedAt) =>
        writePartitionFieldCommittedAt(doc, key, field, committedAt),
    }
    this.channels.set(channelId, { ref, channel })
    return channel
  }

  public get(realmId: string, docRef: string): RealmChannel {
    requireIdentifier(realmId, 'realmId')
    requireIdentifier(docRef, 'docRef')
    const channelId = deriveChannelId(realmId, docRef)
    const entry = this.channels.get(channelId)
    if (!entry) {
      throw new Error(`Channel ${channelId} is not registered`)
    }
    return entry.channel
  }

  public destroy(realmId: string, docRef: string): void {
    const channel = this.get(realmId, docRef)
    this.channels.delete(channel.channelId)
    destroyDoc(channel.doc)
  }

  public destroyRealm(realmId: string): void {
    for (const entry of Array.from(this.channels.values())) {
      if (entry.ref.realmId === realmId) {
        this.destroy(realmId, entry.ref.docRef)
      }
    }
  }

  public destroyAll(): void {
    for (const entry of Array.from(this.channels.values())) {
      this.destroy(entry.ref.realmId, entry.ref.docRef)
    }
  }

  public get size(): number {
    return this.channels.size
  }
}

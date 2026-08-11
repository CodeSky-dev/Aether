// @aether/current-sync · Realm Channel Partition 注册表。
import type { YDocPartitionKey } from '@aether/types'
import {
  appendPartitionText,
  createDoc,
  destroyDoc,
  getPartition,
  readPartitionText,
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
    }
    this.channels.set(channelId, { ref, channel })
    return channel
  }

  public get(ref: RealmChannelRef, realmId = ref.realmId): RealmChannel {
    if (ref.realmId !== realmId) {
      throw new Error(
        `Realm mismatch for channel ${ref.channelId}: expected ${ref.realmId}, received ${realmId}`,
      )
    }
    const entry = this.channels.get(ref.channelId)
    if (!entry) {
      throw new Error(`Channel ${ref.channelId} is not registered`)
    }
    if (
      entry.ref.realmId !== ref.realmId ||
      entry.ref.docRef !== ref.docRef
    ) {
      throw new Error(`Channel reference ${ref.channelId} does not match registry`)
    }
    return entry.channel
  }

  public destroy(ref: RealmChannelRef, realmId = ref.realmId): void {
    const channel = this.get(ref, realmId)
    this.channels.delete(ref.channelId)
    destroyDoc(channel.doc)
  }

  public destroyRealm(realmId: string): void {
    for (const entry of Array.from(this.channels.values())) {
      if (entry.ref.realmId === realmId) {
        this.destroy(entry.ref)
      }
    }
  }

  public destroyAll(): void {
    for (const entry of Array.from(this.channels.values())) {
      this.destroy(entry.ref)
    }
  }

  public get size(): number {
    return this.channels.size
  }
}

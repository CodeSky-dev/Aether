// @aether/editor-host · 裸 Yjs API 的唯一适配层。
import type { YDocPartitionKey } from '@aether/types'
import * as Y from 'yjs'

export function createDoc(): Y.Doc {
  return new Y.Doc()
}

export function getPartition<T extends YDocPartitionKey>(
  doc: Y.Doc,
  key: T,
): Y.Map<unknown> {
  return doc.getMap(key)
}

export function encodeDocUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}

export function encodeDocStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc)
}

export function diffDocUpdate(
  update: Uint8Array,
  stateVector: Uint8Array,
): Uint8Array {
  return Y.diffUpdate(update, stateVector)
}

export function applyDocUpdate(
  doc: Y.Doc,
  update: Uint8Array,
  origin: symbol,
): void {
  Y.applyUpdate(doc, update, origin)
}

export function appendPartitionText<T extends YDocPartitionKey>(
  doc: Y.Doc,
  key: T,
  field: string,
  value: string,
): void {
  doc.transact(() => {
    const partition = getPartition(doc, key)
    const existing = partition.get(field)
    const text =
      existing instanceof Y.Text ? existing : new Y.Text()
    if (!(existing instanceof Y.Text)) {
      partition.set(field, text)
    }
    text.insert(text.length, value)
  })
}

export function readPartitionText<T extends YDocPartitionKey>(
  doc: Y.Doc,
  key: T,
  field: string,
): string {
  const value = getPartition(doc, key).get(field)
  if (value instanceof Y.Text) {
    return value.toJSON()
  }
  return typeof value === 'string' ? value : ''
}

export function subscribeDocUpdates(
  doc: Y.Doc,
  listener: (update: Uint8Array, origin: unknown) => void,
): () => void {
  doc.on('update', listener)
  return () => doc.off('update', listener)
}

export function destroyDoc(doc: Y.Doc): void {
  doc.destroy()
}

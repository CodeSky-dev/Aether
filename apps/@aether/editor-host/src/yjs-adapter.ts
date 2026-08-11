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

export function applyDocUpdate(
  doc: Y.Doc,
  update: Uint8Array,
  origin: symbol,
): void {
  Y.applyUpdate(doc, update, origin)
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

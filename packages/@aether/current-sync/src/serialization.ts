// @aether/current-sync · Server Actions 可传输的 Yjs 序列化适配层。
import { CRDT_SCHEMA_VERSION } from '@aether/types'

interface SerializedYjsValue {
  schemaVersion: number
  data: string
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return getBtoa()(binary)
}

function fromBase64(value: string): Uint8Array {
  try {
    const binary = getAtob()(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    throw new Error('Invalid base64 payload')
  }
}

function getBtoa(): (value: string) => string {
  return (
    globalThis as typeof globalThis & { btoa: (value: string) => string }
  ).btoa
}

function getAtob(): (value: string) => string {
  return (
    globalThis as typeof globalThis & { atob: (value: string) => string }
  ).atob
}

function encode(value: Uint8Array): string {
  return JSON.stringify({
    schemaVersion: CRDT_SCHEMA_VERSION,
    data: toBase64(value),
  } satisfies SerializedYjsValue)
}

function decode(serialized: string): Uint8Array {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Invalid serialized Yjs payload')
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid serialized Yjs payload')
  }
  const payload = value as Partial<SerializedYjsValue>
  if (payload.schemaVersion !== CRDT_SCHEMA_VERSION) {
    throw new Error(
      `CRDT schema version mismatch: expected ${CRDT_SCHEMA_VERSION}, received ${String(payload.schemaVersion)}`,
    )
  }
  if (typeof payload.data !== 'string') {
    throw new Error('Invalid serialized Yjs payload data')
  }
  return fromBase64(payload.data)
}

export function serializeUpdate(update: Uint8Array): string {
  return encode(update)
}

export function deserializeUpdate(serialized: string): Uint8Array {
  return decode(serialized)
}

export function serializeStateVector(stateVector: Uint8Array): string {
  return encode(stateVector)
}

export function deserializeStateVector(serialized: string): Uint8Array {
  return decode(serialized)
}

// @aether/current-sync · Server Actions 可传输的 Yjs 序列化适配层。
import { CRDT_SCHEMA_VERSION } from '@aether/types'

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

interface SerializedYjsValue {
  schemaVersion: number
  data: string
}

function toBase64(bytes: Uint8Array): string {
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    result += BASE64_ALPHABET[(triplet >> 18) & 63]
    result += BASE64_ALPHABET[(triplet >> 12) & 63]
    result += second === undefined ? '=' : BASE64_ALPHABET[(triplet >> 6) & 63]
    result += third === undefined ? '=' : BASE64_ALPHABET[triplet & 63]
  }
  return result
}

function fromBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0) {
    throw new Error('Invalid base64 payload')
  }
  const output: number[] = []
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index] ?? '')
    const second = BASE64_ALPHABET.indexOf(value[index + 1] ?? '')
    const thirdChar = value[index + 2] ?? '='
    const fourthChar = value[index + 3] ?? '='
    const third = thirdChar === '=' ? 0 : BASE64_ALPHABET.indexOf(thirdChar)
    const fourth =
      fourthChar === '=' ? 0 : BASE64_ALPHABET.indexOf(fourthChar)
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new Error('Invalid base64 payload')
    }
    const triplet = (first << 18) | (second << 12) | (third << 6) | fourth
    output.push((triplet >> 16) & 255)
    if (thirdChar !== '=') {
      output.push((triplet >> 8) & 255)
    }
    if (fourthChar !== '=') {
      output.push(triplet & 255)
    }
  }
  return new Uint8Array(output)
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

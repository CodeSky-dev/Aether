import { describe, expect, it } from 'vitest'
import {
  deserializeStateVector,
  deserializeUpdate,
  serializeStateVector,
  serializeUpdate,
} from '../src/index.js'

describe('Yjs serialization adapter', () => {
  it('往返编码 update 与 state vector', () => {
    const update = new Uint8Array([0, 1, 2, 253, 254, 255])
    const stateVector = new Uint8Array([3, 4, 5])

    expect(deserializeUpdate(serializeUpdate(update))).toEqual(update)
    expect(deserializeStateVector(serializeStateVector(stateVector))).toEqual(
      stateVector,
    )
  })

  it('版本不匹配时显式失败', () => {
    const payload = JSON.stringify({ schemaVersion: 999, data: 'AA==' })

    expect(() => deserializeUpdate(payload)).toThrow(
      'CRDT schema version mismatch',
    )
  })

  it('非法 base64 输入显式失败', () => {
    const payload = JSON.stringify({ schemaVersion: 1, data: '%%%=' })

    expect(() => deserializeUpdate(payload)).toThrow('Invalid base64 payload')
  })
})

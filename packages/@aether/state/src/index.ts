import {
  createStore,
  type StoreApi,
} from 'zustand/vanilla'
import type {
  PresenceSnapshot,
  YDocPartitionKey,
} from '@aether/types'
import {
  readPartitionField,
  subscribeDocUpdates,
  writePartitionField,
  type ProviderConnectionState,
  type YjsProvider,
} from '@aether/current-sync'

export type StateValue =
  | boolean
  | null
  | number
  | string
  | StateValue[]
  | { [key: string]: StateValue }

export interface CurrentStateBinding {
  partition: YDocPartitionKey
  fieldPath: string
}

export interface CurrentState {
  connectionState: ProviderConnectionState
  presence: readonly PresenceSnapshot[]
  fieldValue: StateValue | undefined
  bind(
    provider: YjsProvider,
    binding: CurrentStateBinding,
  ): () => void
  unbind(): void
  setFieldValue(value: unknown): void
  setLocalPresence(
    presence: Pick<PresenceSnapshot, 'cursor' | 'selection'>,
  ): void
}

export type CurrentStateStore = StoreApi<CurrentState>

export function createCurrentStateStore(): CurrentStateStore {
  let cleanupBinding: (() => void) | null = null
  let activeProvider: YjsProvider | null = null
  let activeBinding: CurrentStateBinding | null = null

  const store = createStore<CurrentState>((set) => {
    const resetProjection = (): void => {
      set({
        connectionState: 'disconnected',
        presence: [],
        fieldValue: undefined,
      })
    }

    const unbind = (): void => {
      cleanupBinding?.()
      cleanupBinding = null
      activeProvider = null
      activeBinding = null
      resetProjection()
    }

    const bind = (
      provider: YjsProvider,
      binding: CurrentStateBinding,
    ): (() => void) => {
      unbind()
      activeProvider = provider
      activeBinding = binding
      let active = true
      const refreshField = (): void => {
        if (!active) {
          return
        }
        set({
          fieldValue: toStateValue(
            readPartitionField(
              provider.doc,
              binding.partition,
              binding.fieldPath,
            ),
          ),
        })
      }
      const stopConnection = provider.subscribeConnectionState(
        (connectionState) => set({ connectionState }),
      )
      const stopPresence = provider.subscribePresence((presence) =>
        set({ presence: presence.map((snapshot) => ({ ...snapshot })) }),
      )
      const stopDocument = subscribeDocUpdates(provider.doc, refreshField)
      refreshField()
      const cleanup = (): void => {
        if (!active) {
          return
        }
        active = false
        stopConnection()
        stopPresence()
        stopDocument()
        if (cleanupBinding === cleanup) {
          cleanupBinding = null
          activeProvider = null
          activeBinding = null
          resetProjection()
        }
      }
      cleanupBinding = cleanup
      return cleanup
    }

    const setFieldValue = (value: unknown): void => {
      if (!activeProvider || !activeBinding) {
        throw new Error('Current state store is not bound')
      }
      writePartitionField(
        activeProvider.doc,
        activeBinding.partition,
        activeBinding.fieldPath,
        value,
      )
    }

    const setLocalPresence = (
      presence: Pick<PresenceSnapshot, 'cursor' | 'selection'>,
    ): void => {
      if (!activeProvider) {
        throw new Error('Current state store is not bound')
      }
      activeProvider.setLocalPresence(presence)
    }

    return {
      connectionState: 'disconnected',
      presence: [],
      fieldValue: undefined,
      bind,
      unbind,
      setFieldValue,
      setLocalPresence,
    }
  })

  return store
}

function toStateValue(value: unknown): StateValue | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => toStateValue(item))
      .filter((item): item is StateValue => item !== undefined)
  }
  if (typeof value !== 'object') {
    return undefined
  }
  const objectValue = value as Record<string, unknown>
  if (
    'toJSON' in objectValue &&
    typeof objectValue.toJSON === 'function'
  ) {
    const toJSON = objectValue.toJSON as () => unknown
    return toStateValue(toJSON())
  }
  const result: { [key: string]: StateValue } = {}
  for (const [key, item] of Object.entries(objectValue)) {
    const projected = toStateValue(item)
    if (projected !== undefined) {
      result[key] = projected
    }
  }
  return result
}

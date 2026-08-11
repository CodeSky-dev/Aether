// @aether/current-sync · Current 汇合能力统一出口。
export {
  PresenceChannel,
  type PresenceChangeListener,
  type PresenceOptions,
} from './presence.js'
export {
  YjsProvider,
  type ConnectionStateListener,
  type ProviderConnectionState,
  type ProviderOptions,
} from './provider.js'
export {
  createLoopbackTransportPair,
  type ProviderMessage,
  type ProviderMessageHandler,
  type ProviderTransport,
} from './transport.js'
export {
  applyDocUpdate,
  appendPartitionText,
  createDoc,
  destroyDoc,
  diffDocUpdate,
  encodeDocStateVector,
  encodeDocUpdate,
  getPartition,
  readPartitionText,
  subscribeDocUpdates,
} from './yjs-adapter.js'
export {
  RealmChannelRegistry,
  type RealmChannel,
  type RealmChannelRef,
} from './realm-channel.js'
export {
  ConvergeEngine,
  type ConflictRecord,
  type ConvergeEngineOptions,
  type ConvergeResult,
  type ConvergeStrategy,
  type EntityCommitOperation,
  type FieldPolicy,
} from './converge.js'
export {
  deserializeStateVector,
  deserializeUpdate,
  serializeStateVector,
  serializeUpdate,
} from './serialization.js'

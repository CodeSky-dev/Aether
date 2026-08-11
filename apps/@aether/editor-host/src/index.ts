// @aether/editor-host · Yjs Provider 基线与 Presence 通道。
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

// @aether/thread-bindings · Thread-Binding 内核导出。
export {
  appendDialogueToThread,
  clearDialogue,
  createDialogueMessage,
  getDialogueMessages,
  removeDialogueFromThread,
} from './dialogue.js'
export type {
  CreateDialogueMessageInput,
  DialogueDb,
} from './dialogue.js'

export {
  createThread,
  deleteThread,
  driftAnchor,
  getThread,
  listThreads,
  listThreadsByStatus,
  requireRealmScope,
  updateThread,
} from './anchor.js'
export type {
  AnchorDriftInput,
  AnchorDriftResult,
  CreateThreadInput,
  ThreadDb,
  ThreadRecord,
  UpdateThreadInput,
} from './anchor.js'

export { rehydrateThread } from './rehydrate.js'
export type { RehydrationContext, RehydrateOptions } from './rehydrate.js'

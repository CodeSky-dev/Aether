// @aether/editor-host · Yjs Provider 基线 —— Y.Doc 工厂。
// 按 @aether/types 的 YDocPartitionKey 契约初始化 Realm Y.Doc 顶层结构。
// M0 基线只建立 code 分区（Y.Text），M1 由 @aether/current-sync 扩展全部分区。
//
// P2-11 修复：统一 Y.Doc 顶层结构与 @aether/web current-editor 一致。
// 双方均使用 doc.getMap('content') 作为顶层分区容器：
//   - web: content.get('text') → 单文本编辑器 Y.Text
//   - editor-host: content.get('code:<filePath>') → 代码文件 Y.Text
// 这样同一 Realm 文档在两个宿主间结构兼容，接入 Hocuspocus 后可互开。
import * as Y from 'yjs'
export const REALM_DOC_REF_PREFIX = 'realm:'
/** 顶层 content Map 的 key（与 @aether/web current-editor 保持一致） */
export const CONTENT_MAP_KEY = 'content'
/** 由 realm slug 派生稳定的 doc_ref（Yjs 文档唯一标识） */
export function docRefForRealm(realmSlug: string): string {
  return `${REALM_DOC_REF_PREFIX}${realmSlug}`
}
/** code 分区在 content Map 中的 key */
export function fileKey(filePath: string): string {
  return `code:${filePath}`
}
/**
 * 创建 Realm Y.Doc 基线，doc_ref 作为文档唯一标识。
 * M0 供编辑器宿主绑定文本；M1 扩展 presence/entityCursors/threads 等分区。
 */
export function createRealmDoc(docRef: string): Y.Doc {
  const doc = new Y.Doc()
  doc.guid = docRef
  return doc
}
/** 取或建某个文件路径的 Y.Text（存于顶层 content Map 中，与 web 结构统一） */
export function getOrCreateText(doc: Y.Doc, filePath: string): Y.Text {
  const contentMap = doc.getMap(CONTENT_MAP_KEY)
  const key = fileKey(filePath)
  const existing = contentMap.get(key)
  if (existing instanceof Y.Text) return existing
  const text = new Y.Text('')
  contentMap.set(key, text)
  return text
}

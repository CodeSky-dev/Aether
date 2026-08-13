// @aether/editor-host · Yjs Provider 基线 —— Y.Doc 工厂。
// 按 @aether/types 的 YDocPartitionKey 契约初始化 Realm Y.Doc 顶层结构。
// M0 基线只建立 code 分区（Y.Text），M1 由 @aether/current-sync 扩展全部分区。
import * as Y from 'yjs'

export const REALM_DOC_REF_PREFIX = 'realm:'

/** 由 realm slug 派生稳定的 doc_ref（Yjs 文档唯一标识） */
export function docRefForRealm(realmSlug: string): string {
  return `${REALM_DOC_REF_PREFIX}${realmSlug}`
}

/** code 分区顶层文件 key */
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

/** 取或建某个文件路径的 Y.Text（Y.Text 由 doc.getText 惰性创建并持久化） */
export function getOrCreateText(doc: Y.Doc, filePath: string): Y.Text {
  return doc.getText(fileKey(filePath))
}

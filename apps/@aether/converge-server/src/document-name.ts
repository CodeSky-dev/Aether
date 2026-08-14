// @aether/converge-server · documentName 解析工具
// Hocuspocus 的 documentName 是字符串，客户端连接时指定。
// Aether 格式: "{realmId}/{docRef}"，realmId 是 UUID（不含 /），
// docRef 可包含任意字符（含冒号，如 "doc:realm-a:current-1"）。

export interface DocumentRef {
  realmId: string
  docRef: string
}

/**
 * 将 realmId + docRef 编码为 Hocuspocus documentName。
 */
export function formatDocumentName(realmId: string, docRef: string): string {
  return `${realmId}/${docRef}`
}

/**
 * 解析 Hocuspocus documentName 为 realmId + docRef。
 * 按第一个 "/" 分割，realmId 是 UUID，docRef 是剩余部分。
 */
export function parseDocumentName(documentName: string): DocumentRef {
  const slashIndex = documentName.indexOf('/')
  if (slashIndex === -1) {
    throw new Error(
      `Invalid documentName "${documentName}": expected format "{realmId}/{docRef}"`,
    )
  }
  const realmId = documentName.slice(0, slashIndex)
  const docRef = documentName.slice(slashIndex + 1)
  if (!realmId || !docRef) {
    throw new Error(
      `Invalid documentName "${documentName}": realmId and docRef must be non-empty`,
    )
  }
  return { realmId, docRef }
}

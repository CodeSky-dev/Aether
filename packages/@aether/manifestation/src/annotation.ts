// @aether/manifestation · Inline Annotation
// CRDT 持久化的 Inline Annotation：标注绑定到代码位置，随 Yjs 文档同步。
// 多人可见、可编辑、冲突自由。
//
// 存储结构：manifestations 分区下的 Y.Map
//   key: `${threadId}:${annotationId}`
//   value: { file, startLine, endLine, content, author, createdAt, resolved }
//
// 与 @aether/current-sync 协作：
// - 通过 CurrentSync 的 Yjs Provider 获取 Y.Doc 引用
// - annotations 存储在独立的 `manifestations` Y.Map 中
// - 支持实时协作：多个用户同时标注不会冲突
import * as Y from 'yjs'

export interface InlineAnnotation {
  id: string
  threadId: string
  file: string
  startLine: number
  endLine: number
  content: string
  authorId: string
  authorType: 'human' | 'entity'
  createdAt: number
  resolved: boolean
  metadata?: Record<string, unknown>
}

export interface CreateAnnotationInput {
  threadId: string
  file: string
  startLine: number
  endLine: number
  content: string
  authorId: string
  authorType: 'human' | 'entity'
  metadata?: Record<string, unknown>
}

export interface ResolveAnnotationInput {
  annotationId: string
  threadId: string
  resolved: boolean
}

const MANIFESTATIONS_KEY = 'manifestations'

/**
 * 从 Y.Doc 获取 manifestations Y.Map。
 * 若不存在则创建（首次调用时自动初始化）。
 */
export function getManifestationsMap(doc: Y.Doc): Y.Map<Y.Map<any>> {
  return doc.getMap(MANIFESTATIONS_KEY)
}

/**
 * 创建一条 Inline Annotation 并写入 CRDT。
 * 写入后自动广播到所有连接的客户端。
 */
export function createAnnotation(
  doc: Y.Doc,
  input: CreateAnnotationInput,
): InlineAnnotation {
  const annotation: InlineAnnotation = {
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId: input.threadId,
    file: input.file,
    startLine: input.startLine,
    endLine: input.endLine,
    content: input.content,
    authorId: input.authorId,
    authorType: input.authorType,
    createdAt: Date.now(),
    resolved: false,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  }

  const manifestations = getManifestationsMap(doc)
  const yAnn = new Y.Map<any>()
  yAnn.set('id', annotation.id)
  yAnn.set('threadId', annotation.threadId)
  yAnn.set('file', annotation.file)
  yAnn.set('startLine', annotation.startLine)
  yAnn.set('endLine', annotation.endLine)
  yAnn.set('content', annotation.content)
  yAnn.set('authorId', annotation.authorId)
  yAnn.set('authorType', annotation.authorType)
  yAnn.set('createdAt', annotation.createdAt)
  yAnn.set('resolved', annotation.resolved)
  if (annotation.metadata) {
    yAnn.set('metadata', JSON.stringify(annotation.metadata))
  }

  manifestations.set(`${input.threadId}:${annotation.id}`, yAnn)
  return annotation
}

/**
 * 解析（resolve/unresolve）一条 Annotation。
 * resolved=true 表示标注问题已解决，保留记录但不再显示为活跃。
 */
export function resolveAnnotation(
  doc: Y.Doc,
  threadId: string,
  annotationId: string,
  resolved: boolean,
): boolean {
  const manifestations = getManifestationsMap(doc)
  const key = `${threadId}:${annotationId}`
  const yAnn = manifestations.get(key)
  if (!yAnn) {
    return false
  }
  yAnn.set('resolved', resolved)
  return true
}

/**
 * 删除一条 Annotation。
 */
export function deleteAnnotation(
  doc: Y.Doc,
  threadId: string,
  annotationId: string,
): boolean {
  const manifestations = getManifestationsMap(doc)
  const key = `${threadId}:${annotationId}`
  const hadKey = manifestations.has(key)
  if (hadKey) {
    manifestations.delete(key)
    return true
  }
  return false
}

/**
 * 列出指定 Thread 的所有 Annotation。
 */
export function listAnnotationsByThread(
  doc: Y.Doc,
  threadId: string,
  includeResolved = false,
): InlineAnnotation[] {
  const manifestations = getManifestationsMap(doc)
  const results: InlineAnnotation[] = []

  manifestations.forEach((yAnn, key) => {
    if (!key.startsWith(`${threadId}:`)) return

    const resolved = yAnn.get('resolved') ?? false
    if (!includeResolved && resolved) return

    results.push({
      id: yAnn.get('id') as string,
      threadId: yAnn.get('threadId') as string,
      file: yAnn.get('file') as string,
      startLine: yAnn.get('startLine') as number,
      endLine: yAnn.get('endLine') as number,
      content: yAnn.get('content') as string,
      authorId: yAnn.get('authorId') as string,
      authorType: (yAnn.get('authorType') as 'human' | 'entity'),
      createdAt: yAnn.get('createdAt') as number,
      resolved,
      metadata: yAnn.has('metadata')
        ? JSON.parse(yAnn.get('metadata') as string)
        : undefined,
    })
  })

  return results.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * 列出指定文件的所有 Annotation（跨 Thread）。
 */
export function listAnnotationsByFile(
  doc: Y.Doc,
  file: string,
  includeResolved = false,
): InlineAnnotation[] {
  const allAnnotations = listAllAnnotations(doc, includeResolved)
  return allAnnotations.filter((a) => a.file === file)
}

/**
 * 列出所有 Annotation。
 */
export function listAllAnnotations(
  doc: Y.Doc,
  includeResolved = false,
): InlineAnnotation[] {
  const manifestations = getManifestationsMap(doc)
  const results: InlineAnnotation[] = []

  manifestations.forEach((yAnn) => {
    const resolved = yAnn.get('resolved') ?? false
    if (!includeResolved && resolved) return

    results.push({
      id: yAnn.get('id') as string,
      threadId: yAnn.get('threadId') as string,
      file: yAnn.get('file') as string,
      startLine: yAnn.get('startLine') as number,
      endLine: yAnn.get('endLine') as number,
      content: yAnn.get('content') as string,
      authorId: yAnn.get('authorId') as string,
      authorType: (yAnn.get('authorType') as 'human' | 'entity'),
      createdAt: yAnn.get('createdAt') as number,
      resolved,
      metadata: yAnn.has('metadata')
        ? JSON.parse(yAnn.get('metadata') as string)
        : undefined,
    })
  })

  return results.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * 获取指定 Annotation。
 */
export function getAnnotation(
  doc: Y.Doc,
  threadId: string,
  annotationId: string,
): InlineAnnotation | null {
  const manifestations = getManifestationsMap(doc)
  const key = `${threadId}:${annotationId}`
  const yAnn = manifestations.get(key)
  if (!yAnn) return null

  return {
    id: yAnn.get('id') as string,
    threadId: yAnn.get('threadId') as string,
    file: yAnn.get('file') as string,
    startLine: yAnn.get('startLine') as number,
    endLine: yAnn.get('endLine') as number,
    content: yAnn.get('content') as string,
    authorId: yAnn.get('authorId') as string,
    authorType: (yAnn.get('authorType') as 'human' | 'entity'),
    createdAt: yAnn.get('createdAt') as number,
    resolved: yAnn.get('resolved') ?? false,
    metadata: yAnn.has('metadata')
      ? JSON.parse(yAnn.get('metadata') as string)
      : undefined,
  }
}
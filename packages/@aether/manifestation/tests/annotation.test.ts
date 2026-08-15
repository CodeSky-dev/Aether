// @aether/manifestation · Inline Annotation CRDT 单元测试
import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  createAnnotation,
  listAnnotationsByThread,
  listAnnotationsByFile,
  listAllAnnotations,
  resolveAnnotation,
  deleteAnnotation,
  getAnnotation,
  getManifestationsMap,
} from '../src/annotation.js'

let doc: Y.Doc

beforeEach(() => {
  doc = new Y.Doc()
})

describe('getManifestationsMap', () => {
  it('返回 Y.Map 实例', () => {
    const map = getManifestationsMap(doc)
    expect(map).toBeInstanceOf(Y.Map)
  })

  it('多次调用返回同一实例', () => {
    const map1 = getManifestationsMap(doc)
    const map2 = getManifestationsMap(doc)
    expect(map1).toBe(map2)
  })
})

describe('createAnnotation', () => {
  it('创建 annotation 并存储到 CRDT', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'src/app.ts',
      startLine: 10,
      endLine: 20,
      content: '这里有一个类型错误',
      authorId: 'u1',
      authorType: 'human',
    })

    expect(ann.id).toBeTruthy()
    expect(ann.threadId).toBe('t1')
    expect(ann.file).toBe('src/app.ts')
    expect(ann.startLine).toBe(10)
    expect(ann.endLine).toBe(20)
    expect(ann.content).toBe('这里有一个类型错误')
    expect(ann.authorType).toBe('human')
    expect(ann.resolved).toBe(false)
  })

  it('带 metadata 创建 annotation', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'main.py',
      startLine: 5,
      endLine: 8,
      content: '缺少 docstring',
      authorId: 'entity-1',
      authorType: 'entity',
      metadata: { severity: 'warning', suggestion: 'Add docstring' },
    })

    expect(ann.metadata).toEqual({ severity: 'warning', suggestion: 'Add docstring' })
  })
})

describe('listAnnotationsByThread', () => {
  it('按 threadId 过滤返回 annotations', () => {
    createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'Ann 1',
      authorId: 'u1',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't1',
      file: 'b.ts',
      startLine: 10,
      endLine: 15,
      content: 'Ann 2',
      authorId: 'u2',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't2',
      file: 'c.ts',
      startLine: 1,
      endLine: 5,
      content: 'Other thread',
      authorId: 'u1',
      authorType: 'human',
    })

    const result = listAnnotationsByThread(doc, 't1')
    expect(result).toHaveLength(2)
    expect(result[0]?.content).toBe('Ann 1')
    expect(result[1]?.content).toBe('Ann 2')
  })

  it('空 thread 返回空数组', () => {
    const result = listAnnotationsByThread(doc, 'nonexistent')
    expect(result).toEqual([])
  })

  it('默认过滤 resolved annotations', () => {
    createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'Active',
      authorId: 'u1',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 6,
      endLine: 10,
      content: 'Resolved',
      authorId: 'u1',
      authorType: 'human',
    })

    // Resolve the second one
    const anns = listAnnotationsByThread(doc, 't1')
    const resolvedAnn = anns.find((a) => a.content === 'Resolved')
    expect(resolvedAnn).toBeDefined()
    resolveAnnotation(doc, 't1', resolvedAnn!.id, true)

    const activeResult = listAnnotationsByThread(doc, 't1')
    expect(activeResult).toHaveLength(1)
    expect(activeResult[0]?.content).toBe('Active')

    const allResult = listAnnotationsByThread(doc, 't1', true)
    expect(allResult).toHaveLength(2)
  })
})

describe('listAnnotationsByFile', () => {
  it('按文件路径过滤', () => {
    createAnnotation(doc, {
      threadId: 't1',
      file: 'src/app.ts',
      startLine: 1,
      endLine: 5,
      content: 'In app',
      authorId: 'u1',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't2',
      file: 'src/app.ts',
      startLine: 10,
      endLine: 15,
      content: 'Also in app',
      authorId: 'u2',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't1',
      file: 'other.ts',
      startLine: 1,
      endLine: 5,
      content: 'Other file',
      authorId: 'u1',
      authorType: 'human',
    })

    const result = listAnnotationsByFile(doc, 'src/app.ts')
    expect(result).toHaveLength(2)
  })
})

describe('listAllAnnotations', () => {
  it('返回所有 annotations', () => {
    createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'Ann 1',
      authorId: 'u1',
      authorType: 'human',
    })
    createAnnotation(doc, {
      threadId: 't2',
      file: 'b.ts',
      startLine: 1,
      endLine: 5,
      content: 'Ann 2',
      authorId: 'entity-1',
      authorType: 'entity',
    })

    const all = listAllAnnotations(doc)
    expect(all).toHaveLength(2)
  })

  it('按 createdAt 升序排列', () => {
    const ann1 = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'First',
      authorId: 'u1',
      authorType: 'human',
    })
    const ann2 = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 6,
      endLine: 10,
      content: 'Second',
      authorId: 'u1',
      authorType: 'human',
    })

    const all = listAllAnnotations(doc)
    expect(all[0]?.id).toBe(ann1.id)
    expect(all[1]?.id).toBe(ann2.id)
  })
})

describe('resolveAnnotation', () => {
  it('标记 annotation 为 resolved', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'To resolve',
      authorId: 'u1',
      authorType: 'human',
    })

    const ok = resolveAnnotation(doc, 't1', ann.id, true)
    expect(ok).toBe(true)

    const fetched = getAnnotation(doc, 't1', ann.id)
    expect(fetched?.resolved).toBe(true)
  })

  it('不存在的 annotation 返回 false', () => {
    const ok = resolveAnnotation(doc, 't1', 'nonexistent', true)
    expect(ok).toBe(false)
  })

  it('取消 resolve', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'Toggle',
      authorId: 'u1',
      authorType: 'human',
    })
    resolveAnnotation(doc, 't1', ann.id, true)
    resolveAnnotation(doc, 't1', ann.id, false)

    const fetched = getAnnotation(doc, 't1', ann.id)
    expect(fetched?.resolved).toBe(false)
  })
})

describe('deleteAnnotation', () => {
  it('删除 annotation', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 1,
      endLine: 5,
      content: 'To delete',
      authorId: 'u1',
      authorType: 'human',
    })

    const ok = deleteAnnotation(doc, 't1', ann.id)
    expect(ok).toBe(true)

    const fetched = getAnnotation(doc, 't1', ann.id)
    expect(fetched).toBeNull()
  })

  it('不存在的 annotation 返回 false', () => {
    const ok = deleteAnnotation(doc, 't1', 'nonexistent')
    expect(ok).toBe(false)
  })
})

describe('getAnnotation', () => {
  it('按 ID 获取 annotation', () => {
    const ann = createAnnotation(doc, {
      threadId: 't1',
      file: 'a.ts',
      startLine: 10,
      endLine: 20,
      content: 'Test content',
      authorId: 'u1',
      authorType: 'human',
      metadata: { key: 'value' },
    })

    const fetched = getAnnotation(doc, 't1', ann.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(ann.id)
    expect(fetched?.content).toBe('Test content')
    expect(fetched?.metadata).toEqual({ key: 'value' })
  })

  it('不存在返回 null', () => {
    const fetched = getAnnotation(doc, 't1', 'nonexistent')
    expect(fetched).toBeNull()
  })
})

describe('CRDT 协作模拟', () => {
  it('两个 Y.Doc 同步 annotations', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Simulate sync
    const update1 = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update1)

    createAnnotation(doc1, {
      threadId: 't1',
      file: 'shared.ts',
      startLine: 1,
      endLine: 5,
      content: 'From doc1',
      authorId: 'u1',
      authorType: 'human',
    })

    const update2 = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update2)

    const anns = listAnnotationsByThread(doc2, 't1')
    expect(anns).toHaveLength(1)
    expect(anns[0]?.content).toBe('From doc1')
  })

  it('并发创建不冲突', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    createAnnotation(doc1, {
      threadId: 't1',
      file: 'shared.ts',
      startLine: 1,
      endLine: 5,
      content: 'From doc1',
      authorId: 'u1',
      authorType: 'human',
    })
    createAnnotation(doc2, {
      threadId: 't1',
      file: 'shared.ts',
      startLine: 10,
      endLine: 15,
      content: 'From doc2',
      authorId: 'u2',
      authorType: 'human',
    })

    // Sync both ways
    const update1 = Y.encodeStateAsUpdate(doc1)
    const update2 = Y.encodeStateAsUpdate(doc2)
    Y.applyUpdate(doc1, update2)
    Y.applyUpdate(doc2, update1)

    const anns1 = listAnnotationsByThread(doc1, 't1')
    const anns2 = listAnnotationsByThread(doc2, 't1')
    expect(anns1).toHaveLength(2)
    expect(anns2).toHaveLength(2)
  })
})
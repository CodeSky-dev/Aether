// @aether/web · Yjs Current 编辑器组件（轮询通道 + Server Actions 落库）
'use client'

import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import {
  applyDocUpdate,
  deserializeUpdate,
  subscribeDocUpdates,
} from '@aether/current-sync'
import type { ActorType } from '@aether/types'
import {
  appendCurrentUpdate,
  getCurrentCursor,
  replayCurrentUpdates,
} from '@/app/actions/current'
import { serializeUpdate } from '@aether/current-sync'

interface CurrentEditorProps {
  realmId: string
  threadId: string
  /** 操作者身份；M1 阶段默认 entity */
  actorType?: ActorType
  actorId?: string
}

const REMOTE_ORIGIN = Symbol('channel-remote')
const CONTENT_MAP_KEY = 'content'
const CONTENT_TEXT_KEY = 'text'

/** 确保 Y.Doc 内有 content Map + content Text，不存在则初始化。 */
function ensureContentText(doc: Y.Doc): Y.Text {
  const map = doc.getMap(CONTENT_MAP_KEY)
  const existing = map.get(CONTENT_TEXT_KEY)
  if (existing instanceof Y.Text) return existing
  const text = new Y.Text('')
  map.set(CONTENT_TEXT_KEY, text)
  return text
}

export default function CurrentEditor({
  realmId,
  threadId,
  actorType = 'entity',
  actorId = 'web-client',
}: CurrentEditorProps) {
  const docRef = `thread:${threadId}`
  const docRefRef = useRef(docRef)
  docRefRef.current = docRef

  const doc = useRef(new Y.Doc()).current
  const clientRef = useRef<{
    localSeq: number | null
    remoteCursor: number | null
    polling: boolean
    stopPollTimer: (() => void) | null
  }>({
    localSeq: null,
    remoteCursor: null,
    polling: false,
    stopPollTimer: null,
  })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [connected, setConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 初始化 Y.Doc：确保 content 分区存在
  useEffect(() => {
    ensureContentText(doc)

    // 监听本地 update → 落库
    const stopSubscribe = subscribeDocUpdates(doc, (update) => {
      const serialized = serializeUpdate(update)
      appendCurrentUpdate({
        realmId,
        docRef: docRefRef.current,
        serializedPayload: serialized,
        actorType,
        actorId,
        idempotencyKey: `${actorId}:${Date.now()}-${Math.random()}`,
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setSaving(false)
      })
      setSaving(true)
    })

    // 轮询远端更新
    let pollTimer: ReturnType<typeof setInterval> | null = null
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const pollOnce = async () => {
      const state = clientRef.current
      if (state.polling) return
      state.polling = true
      try {
        let hasMore = true
        while (hasMore) {
          const result = await replayCurrentUpdates(
            realmId,
            docRefRef.current,
            state.remoteCursor,
            100,
          )
          for (const item of result.updates) {
            if (item.idempotencyKey.startsWith(`${actorId}:`)) continue
            const payload = (() => {
              try {
                return deserializeUpdate(item.serializedPayload)
              } catch {
                return null
              }
            })()
            if (payload) {
              applyDocUpdate(doc, payload, REMOTE_ORIGIN)
            }
            state.remoteCursor = item.seq
          }
          if (result.nextCursor !== null) {
            state.remoteCursor = result.nextCursor
          }
          hasMore = result.hasMore
        }
      } finally {
        state.polling = false
      }
    }

    pollTimer = setInterval(() => {
      void pollOnce()
    }, 2000)

    // 首次连接：获取当前游标 + 重放
    getCurrentCursor(realmId, docRefRef.current)
      .then(({ cursor }) => {
        clientRef.current.remoteCursor = cursor
        clientRef.current.localSeq = cursor
        setConnected(true)
      })
      .catch(() => {
        setConnected(false)
      })
    void pollOnce()

    return () => {
      stopSubscribe()
      stopPolling()
      clientRef.current.stopPollTimer = null
    }
  }, [realmId, threadId, actorType, actorId])

  // 同步 Y.Text ↔ textarea
  useEffect(() => {
    const yText = ensureContentText(doc)
    const textarea = textareaRef.current
    if (!textarea) return

    const sync = () => {
      if (document.activeElement !== textarea) {
        const newText = yText.toJSON()
        if (textarea.value !== newText) {
          textarea.value = newText
        }
      }
    }

    yText.observe(sync)
    sync()

    const onInput = () => {
      const newText = textarea.value
      const currentText = yText.toJSON()
      if (newText !== currentText) {
        yText.delete(0, currentText.length)
        yText.insert(0, newText)
      }
    }
    textarea.addEventListener('input', onInput)

    return () => {
      yText.unobserve(sync)
      textarea.removeEventListener('input', onInput)
    }
  }, [doc])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
        <span className="text-copy-12 text-neutral-5">{connected ? '已连接（轮询中）' : '连接中…'}</span>
        {saving && <span className="text-copy-12 text-accent">保存中…</span>}
      </div>
      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-copy-12 text-red-600">{error}</p>
      )}
      <textarea
        ref={textareaRef}
        className="min-h-64 w-full resize-y rounded-lg border border-border bg-neutral-1 p-3 text-copy-14 font-mono text-neutral-9 placeholder-neutral-4 outline-none focus:border-accent/50"
        placeholder="编辑 Current…（变更经 Server Actions 落库，2s 轮询同步远端）"
        spellCheck={false}
      />
    </div>
  )
}

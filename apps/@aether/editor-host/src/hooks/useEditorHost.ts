// @aether/editor-host · 宿主 React 绑定。
// 在组件树中创建/复用 EditorHost，并暴露 Presence 订阅状态。
import { useEffect, useRef, useState } from 'react'
import type { PresenceSnapshot } from '@aether/types/yjs'
import { EditorHost, type HostInit } from '../core/host'

export interface UseEditorHostResult {
  host: EditorHost
  /** 当前文件文本（驱动编辑器渲染） */
  text: string
  /** 全部在场客户端状态 */
  presence: Map<number, PresenceSnapshot>
  /** 本客户端 ID */
  selfClientId: number
  setText(text: string): void
  /** 更新自己光标位置 */
  updateCursor(cursor: PresenceSnapshot['cursor']): void
  /** 更新自己选区 */
  updateSelection(selection: PresenceSnapshot['selection']): void
}

export function useEditorHost(init: HostInit): UseEditorHostResult {
  const initRef = useRef(init)
  initRef.current = init

  const [host] = useState(() => new EditorHost(initRef.current))

  const [text, setTextState] = useState(() => host.text.toJSON())
  const [presence, setPresence] = useState<Map<number, PresenceSnapshot>>(
    () => host.presence.getPresence(),
  )

  // 来自 React 的写入标志：Y.Text observer 回读时忽略自身源
  const skipNextTextSync = useRef(false)

  // Y.Text → React state
  useEffect(() => {
    const sync = () => {
      if (skipNextTextSync.current) {
        skipNextTextSync.current = false
        return
      }
      setTextState(host.text.toJSON())
    }
    host.text.observe(sync)
    host.connect()
    return () => {
      host.text.unobserve(sync)
      host.disconnect()
    }
  }, [host])

  // Presence 订阅
  useEffect(() => {
    const unsubscribe = host.presence.subscribe(setPresence)
    return () => {
      unsubscribe()
    }
  }, [host])

  // React → Y.Text（M0 基线全量替换；M1 由 Converge Engine 做 diff 合并）
  const setText = (value: string) => {
    const ytext = host.text
    const current = ytext.toJSON()
    if (current === value) return
    skipNextTextSync.current = true
    ytext.delete(0, current.length)
    ytext.insert(0, value)
    setTextState(value)
  }

  const updateCursor = (cursor: PresenceSnapshot['cursor']) => {
    host.presence.updatePresence({ field: 'cursor', value: cursor })
  }

  const updateSelection = (selection: PresenceSnapshot['selection']) => {
    host.presence.updatePresence({ field: 'selection', value: selection })
  }

  return {
    host,
    text,
    presence,
    selfClientId: host.presence.clientId,
    setText,
    updateCursor,
    updateSelection,
  }
}

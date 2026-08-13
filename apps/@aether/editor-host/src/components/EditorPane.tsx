// @aether/editor-host · 编辑面板。
// 将当前文件 Y.Text 渲染为可编辑文本区，并同步光标/选区到 Presence。
import { useRef, type InputEvent, type KeyboardEvent } from 'react'
import type { PresenceSnapshot } from '@aether/types/yjs'
import type { UseEditorHostResult } from '../hooks/useEditorHost'

export interface EditorPaneProps {
  editor: Pick<
    UseEditorHostResult,
    'text' | 'setText' | 'updateCursor' | 'updateSelection'
  >
}

export function EditorPane({ editor }: EditorPaneProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const onInput = (event: InputEvent<HTMLTextAreaElement>) => {
    editor.setText((event.target as HTMLTextAreaElement).value)
    emitSelection()
  }

  const emitSelection = () => {
    const el = ref.current
    if (!el) return
    editor.updateSelection({
      file: '__editor__',
      start: el.selectionStart,
      end: el.selectionEnd,
    })
  }

  const onKeyUp = (_event: KeyboardEvent<HTMLTextAreaElement>) => {
    emitSelection()
  }

  const onSelect = () => {
    emitSelection()
  }

  const onFocus = () => {
    emitSelection()
    editor.updateCursor({ file: '__editor__', offset: ref.current?.selectionStart ?? 0 })
  }

  const onBlur = () => {
    editor.updateSelection(null)
    editor.updateCursor(null)
  }

  return (
    <textarea
      ref={ref}
      value={editor.text}
      onInput={onInput}
      onKeyUp={onKeyUp}
      onSelect={onSelect}
      onFocus={onFocus}
      onBlur={onBlur}
      spellCheck={false}
      aria-label="Current 编辑器"
      className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-[var(--color-neutral-9)] caret-[var(--color-accent)] outline-none"
    />
  )
}

export interface PresenceBarProps {
  presence: Map<number, PresenceSnapshot>
  selfClientId: number
}

export function PresenceBar({ presence, selfClientId }: PresenceBarProps) {
  const actors = [...presence.entries()]
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--color-neutral-7)]">
      <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]" />
      <span>{actors.length} 个客户端在场</span>
      {actors.map(([clientId, actor]) => (
        <span key={clientId} className="rounded bg-[var(--color-neutral-2)] px-1.5 py-0.5">
          {actor.actorId}
          {clientId === selfClientId ? '（本端）' : ''}
        </span>
      ))}
    </div>
  )
}

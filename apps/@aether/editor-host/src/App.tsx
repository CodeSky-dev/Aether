// @aether/editor-host · App 壳。
// M0 基线：单 Realm 单文件编辑器 + Presence 在场栏。
// 打开第二个标签页即可验证 BroadcastChannel 跨标签页同步。
import { useMemo } from 'react'
import { EditorPane, PresenceBar } from './components/EditorPane'
import { useEditorHost } from './hooks/useEditorHost'

export default function App() {
  const realmSlug = useMemo(() => `demo-${Math.random().toString(36).slice(2, 8)}`, [])

  const editor = useEditorHost({
    realmSlug,
    actorId: `actor-${Math.random().toString(36).slice(2, 8)}`,
    filePath: '/README.md',
  })

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-neutral-2)] px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold">Aether · Editor Host</h1>
          <span className="text-xs text-[var(--color-neutral-7)]">
            Realm {realmSlug}
          </span>
        </div>
        <PresenceBar
          presence={editor.presence}
          selfClientId={editor.selfClientId}
        />
      </header>
      <main className="min-h-0 flex-1">
        <EditorPane editor={editor} />
      </main>
      <footer className="border-t border-[var(--color-neutral-2)] px-4 py-2 text-xs text-[var(--color-neutral-7)]">
        多开一个标签页即可验证 BroadcastChannel 跨标签页协同；Hocuspocus 收敛服务接入见 M1
      </footer>
    </div>
  )
}

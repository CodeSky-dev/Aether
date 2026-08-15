// @aether/web · 导航 Shell：Header + 左侧 Sidebar
// 在 /realms 和 /realms/[id] 下渲染；Landing 页（/）保持简洁不挂载。
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'

interface NavShellProps {
  children: ReactNode
  currentRealmName?: string | null
  currentRealmId?: string | null
}

export default function NavShell({ children, currentRealmName, currentRealmId }: NavShellProps) {
  const pathname = usePathname()
  const isInApp = pathname.startsWith('/realms')
  const [realmName, setRealmName] = useState<string | null>(currentRealmName ?? null)

  useEffect(() => {
    if (currentRealmName !== undefined) {
      setRealmName(currentRealmName)
    }
  }, [currentRealmName])

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border bg-neutral-2 px-6">
        <Link href="/" className="text-copy-14 font-medium text-neutral-9">
          Aether
        </Link>
        {isInApp && realmName && (
          <>
            <span className="mx-3 text-neutral-4">/</span>
            <span className="text-copy-13 text-neutral-6">{realmName}</span>
          </>
        )}
        <div className="ml-auto">
          <Link
            href="/"
            className="text-copy-13 text-neutral-5 transition hover:text-neutral-7"
          >
            首页
          </Link>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {isInApp && currentRealmId !== undefined && (
          <Sidebar currentRealmId={currentRealmId} />
        )}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function Sidebar({ currentRealmId }: { currentRealmId?: string | null }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside className="w-52 shrink-0 border-r border-border bg-neutral-1 p-3">
      <nav className="flex flex-col gap-1">
        <Link
          href="/realms"
          className={`rounded-md px-3 py-1.5 text-copy-13 transition ${
            isActive('/realms')
              ? 'bg-accent/10 font-medium text-accent'
              : 'text-neutral-6 hover:bg-neutral-2 hover:text-neutral-8'
          }`}
        >
          所有 Realm
        </Link>
        {currentRealmId && (
          <>
            <div className="my-1.5 h-px bg-border" />
            <Link
              href={`/realms/${currentRealmId}`}
              className={`rounded-md px-3 py-1.5 text-copy-13 transition ${
                isActive(`/realms/${currentRealmId}`) && !pathname.includes('audit')
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-neutral-6 hover:bg-neutral-2 hover:text-neutral-8'
              }`}
            >
              Thread 列表
            </Link>
            <Link
              href={`/realms/${currentRealmId}/audit`}
              className={`rounded-md px-3 py-1.5 text-copy-13 transition ${
                pathname.includes('/audit')
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-neutral-6 hover:bg-neutral-2 hover:text-neutral-8'
              }`}
            >
              审计记录
            </Link>
          </>
        )}
      </nav>
    </aside>
  )
}

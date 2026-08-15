import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import NavShell from '@/components/nav-shell'

export const metadata: Metadata = {
  title: 'Aether',
  description:
    '协同智能的介质：承载人、Entity、代码与上下文共存的原生环境。',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}): ReactNode {
  return (
    <html lang="zh-CN">
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  )
}

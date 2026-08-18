// @aether/web · 页面页头：eyebrow + serif 标题 + 描述
// 统一各页面的层级节奏（Yohaku：serif 承担层级，eyebrow 用 caption-10）。
import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
}

export default function PageHeader({
  eyebrow,
  title,
  description,
}: PageHeaderProps): ReactNode {
  return (
    <header className="enter mb-10">
      {eyebrow && (
        <p className="text-caption-10 uppercase tracking-[1.5px] text-neutral-6">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 font-serif text-title-28 font-medium text-neutral-10">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-md text-copy-14 text-neutral-7">{description}</p>
      )}
    </header>
  )
}

// @aether/web · 首页
// Yohaku 风格落地页，展示 Aether 品牌主张与 Current 概念。
// 视觉约束遵循 docs/design/yohaku.md：role+px 字号、三档暖灰、accent ≤ 5%。
import Link from 'next/link'

const pillars = [
  {
    title: 'The Current',
    desc: '代码、Thread、Entity 操作写入同一 Y.Doc，以 CRDT 作为架构主干。',
  },
  {
    title: 'Entity 一等公民',
    desc: '拥有 Better-Auth 身份、Yjs 光标与审计轨迹，人机同为受管成员。',
  },
  {
    title: 'Context-Bound Threads',
    desc: '绑定文件范围、代码片段与 Manifestation，上下文无需人脑记忆。',
  },
  {
    title: 'Drift 离线优先',
    desc: '断网由 IndexedDB 持久化与本地缓存支撑，重连后自然 Converge。',
  },
] as const

const terms = [
  { term: 'Realm', mapped: 'Better-Auth Organization + Schema 隔离' },
  { term: 'Current', mapped: 'Yjs Provider + Presence 状态流' },
  { term: 'Entity', mapped: 'AI Agent 一等公民' },
  { term: 'Thread', mapped: 'Context-Bound 叙事单元' },
  { term: 'Manifestation', mapped: 'Vercel Preview 协同标注对象' },
  { term: 'Resonance', mapped: '公开 API 扩展' },
] as const

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-16">
        <p className="text-caption-10 uppercase tracking-[1.5px] text-neutral-5">
          Collaborative Intelligence Medium
        </p>
        <h1 className="mt-3 text-title-28 font-medium text-neutral-10">
          Aether
        </h1>
        <p className="mt-4 text-copy-15 text-neutral-7">
          承载人、Entity、代码与上下文共存的原生环境。协同即架构，AI 是一等成员。
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/realms"
            className="rounded-md bg-accent px-4 py-2 text-copy-14 text-white transition hover:opacity-90"
          >
            进入 Realm
          </Link>
          <a
            href="https://github.com/CodeSky0/Aether"
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-neutral-2 px-4 py-2 text-copy-14 text-neutral-9 ring-1 ring-border transition hover:bg-neutral-3"
          >
            源码
          </a>
        </div>
      </header>

      <section className="mb-16">
        <h2 className="mb-6 text-title-20 font-medium text-neutral-9">
          差异化主张
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map((p) => (
            <article
              key={p.title}
              className="rounded-lg bg-neutral-2 p-4 ring-1 ring-border"
            >
              <h3 className="text-copy-15 font-medium text-neutral-9">
                {p.title}
              </h3>
              <p className="mt-2 text-copy-13 text-neutral-7">{p.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-6 text-title-20 font-medium text-neutral-9">
          术语快表
        </h2>
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <table className="w-full text-copy-13">
            <thead className="bg-neutral-3 text-neutral-7">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Aether 术语</th>
                <th className="px-4 py-2 text-left font-medium">技术映射</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {terms.map((t) => (
                <tr key={t.term} className="bg-neutral-2">
                  <td className="px-4 py-2 text-neutral-9">{t.term}</td>
                  <td className="px-4 py-2 text-neutral-7">{t.mapped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-border pt-6">
        <p className="text-label-12 text-neutral-7">
          M0 基础设施已就绪 · M1 Current 引擎推进中
        </p>
      </footer>
    </main>
  )
}

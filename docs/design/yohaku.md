# Yohaku 余白 · Aether 视觉设计约束

> 事实源：`packages/@aether/ui/src/tokens.css`（静态契约）与 `src/tokens.ts`（native bridge，双源校验）。
> 来源：Yohaku Design System v0.1（2026.04，作者 Innei，github.com/Innei/Yohaku）。Aether 采用本系统约束全部 UI 输出，含第三方 Resonance 扩展。

**一句主张**：一种主色（梅红），三档暖灰，零冷色。为书写而设计——网页、长文、信件、报告，凡是承载文字的地方都能用。

## 十戒律（verify 强制）

| # | 戒律 |
|---|---|
| 01 | 中性灰分三档：n-1–n-4 用作表面，n-5–n-7 用作边框与图标，n-8–n-10 用作正文与标题 |
| 02 | n-5 不能作为文本色；n-6 只能用在很小的标签上；n-7 才开始适合做次要文本 |
| 03 | 禁止使用 Tailwind 默认的 `neutral-50…950`，verify 脚本自动拦截 |
| 04 | 主色在界面上不超过 5%，留给 CTA、focus 状态和品牌标识 |
| 05 | 正文默认用 n-9，深色模式自动反转（纯灰反转，暖意仅由 --color-paper 承载） |
| 06 | 字体只有三族：sans / serif / mono，每一族都必须带 CJK 回退链；logo 专用 `--font-logo-*` |
| 07 | 禁用硬阴影，深度通过描边（ring）或淡阴影（whisper）表现 |
| 08 | 圆角遵循 Tailwind 默认，hero 表面上限 rounded-2xl（16px） |
| 09 | 中文不要用合成 bold，font-medium（500）就是上限 |
| 10 | mockup HTML 必须 `@import tokens.css`，不能直接写 hex 值 |

## 色彩

### 主色 · 梅红 ume

- `#c56473`，token `--color-accent`；深色模式提亮为 `#e095a4`（运行时由 AccentColorStyleInjector 以 OKLCH 动态注入 `--a`）。
- 用途：主 CTA · focus ring · 品牌标识 · 引文竖条。界面用量 ≤ 5%。
- 配对约定：accent 填充配白字（主 CTA）；`ring-1 ring-accent` 配 n-9 文字（输入框 focus）；4px accent 左竖条配 n-9（引文/段落强调）。

### 中性灰 · 素 Pure（三档，暖纸张色）

| token | 值 | 档位 | 用途 |
|---|---|---|---|
| `--color-neutral-1` | `#f9f8f5` | 1 · 表面 | 页底 / 最浅填充 |
| `--color-neutral-2` | `#f0efeb` | 1 · 表面 | 卡片底 |
| `--color-neutral-3` | `#e3e1db` | 1 · 表面 | 微填充 / hover |
| `--color-neutral-4` | `#d0cec6` | 1 · 表面 | 强填充 / 单色图标后衬底 |
| `--color-neutral-5` | `#a8a69f` | 2 · 边框 | 实体面上的边框，禁止作文本 |
| `--color-neutral-6` | `#787670` | 2 · 边框/图标 | 图标描边、极小标签（≤ text-xs） |
| `--color-neutral-7` | `#5c5a55` | 2 · 次要 | 次要文本、caption、元数据 |
| `--color-neutral-8` | `#403f3a` | 3 · 正文 | 加强的次要文本 |
| `--color-neutral-9` | `#24231f` | 3 · 正文 | 正文默认 |
| `--color-neutral-10` | `#141312` | 3 · 标题 | 标题 / 最强调 |

深色模式反转表（values 见 `src/tokens.ts`）：n-1 `#141414` → n-10 `#f8f8f8`，纯中性灰（R=G=B），暖意仅由 paper 承载。使用同一组 `text-neutral-N` 类即可，无需切换类名。

### 语义色 · 和色（日本传统色）

| token | 名称 | 值 | 用途 |
|---|---|---|---|
| `--color-info` | 縹 hanada | `#3d6896` | 信息状态 |
| `--color-success` | 若竹 wakatake | `#5e9f7e` | 成功状态 |
| `--color-warning` | 朽葉 kuchiba | `#a87a3d` | 警告状态 |
| `--color-error` | 蘇芳 suoh | `#a64953` | 错误 / 破坏性操作 |

语义色只用于状态表达（toast、banner、确认 chip、破坏性标签），不做常规装饰。优先 accent 与中性灰。

### 表面与边框

| token | 来源 | 用途 |
|---|---|---|
| `--color-paper` → `var(--surface-paper)` | 宿主运行时 | 页面背景（纸张） |
| `--color-border` | 每主题运行时覆盖 | 卡片、列表默认边框 |
| `--color-muted-1…10` | 映射 neutral-1…10 | 语义别名，二选一使用 |

## 字体

三族，每族必须带完整 CJK 回退链。中文不施合成 bold，`font-medium`（500）即上限。

| 族 | token | 回退链要点 | 用途 |
|---|---|---|---|
| Sans | `--font-sans` | Inter（var）→ PingFang SC → Microsoft YaHei → Noto Sans SC → Hiragino Sans GB | UI 主体、按钮、列表、表单 |
| Serif | `--font-serif` | Noto Serif CJK SC → Source Han Serif → SongTi SC → STSong → Georgia | 标题、长文正文、引文 |
| Mono | `--font-mono` | Operator Mono → Cascadia Code PL → JetBrainsMono → Fira Code → Consolas → Monaco → CJK 回退 | 代码块、版本号、hex 色值、等宽数字 |
| Logo CJK | `--font-logo-cjk` | Noto Serif JP → Source Han Serif → Noto Serif CJK SC | 仅字标，禁用正文 |
| Logo Latin | `--font-logo-latin` | EB Garamond → GT Sectra → Tiempos Headline → Georgia | 仅字标，禁用正文 |

Serif 承担层级，Sans 承担功能，Mono 承担代码。

## 尺度（role + px，Geist 风格）

Tailwind 默认 `text-xs/sm/base/lg/xl/2xl/3xl/...` 与硬编码 `text-[Npx]` 一律禁用，只用下表 role+px token。字号与行高捆绑，字重独立施加。

| token | px | 行高 | 用途 |
|---|---|---|---|
| `text-caption-10` | 10 | 1.4 | Eyebrow 大写 + tracking，慎用 |
| `text-label-12` | 12 | 1.5 | 元数据、小标签、分页、脚注 |
| `text-copy-13` | 13 | 1.54 | 卡片描述、紧凑正文 |
| `text-copy-14` | 14 | 1.57 | **正文默认**（base 14 下即 1rem） |
| `text-copy-15` | 15 | 1.6 | 弹框标题、搜索输入、.prose 正文 |
| `text-copy-16` | 16 | 1.625 | 大号正文 |
| `text-title-20` | 20 | 1.4 | 节标题、副题 |
| `text-title-24` | 24 | 1.33 | 次级 H1 |
| `text-title-28` | 28 | 1.29 | 页面 H1 |
| `text-display-36` | 36 | 1.22 | Hero、大号展示 |
| `text-display-48` | 48 | 1.17 | OG 展示标题 |
| `text-icon-sm/md/lg` | 14/16/18 | — | 仅 `<i>` 图标元素，不带行高 |

字重策略：正文 `font-normal`（400）；标题 `font-medium`（500）；英文短强调可 `font-semibold`（600）；中文禁止 `font-bold`。

## 间距 · 圆角 · 深度 · 模糊

- **间距**：Tailwind 默认 4px 档。惯例：`gap-1`(4) 图标↔文字 / `gap-2`(8) 紧凑堆叠 / `gap-3`(12) 卡片内容 / `gap-4`(16) 区块内容 / `gap-6`(24) 卡片间距 / `gap-8`(32) 大节分隔。
- **圆角**：`rounded`(4) chip → `rounded-md`(6) 默认 → `rounded-lg`(8) 卡片 → `rounded-xl`(12) modal → `rounded-2xl`(16) hero 上限。
- **深度**：`ring-1 ring-border`（无投影，最常用）→ whisper `shadow-[0_4px_24px_rgba(0,0,0,0.05)]`（轻微浮起）。硬投影禁用。
- **背景模糊**：`backdrop-blur-2xl`(40, modal 遮罩/全屏 sheet) / `backdrop-blur-xl`(24, 浮层) / `backdrop-blur-md`(12, hero 磨砂卡片) / `backdrop-blur-sm`(4, 吸顶 header)。必须配半透明表面（`bg-paper/80` 等）。

## 快速决策表

| 场景 | 使用 |
|---|---|
| 正文段落 | `text-copy-14 text-neutral-9` |
| 次要文 | `text-copy-13 text-neutral-7` |
| 小标 / caption | `text-label-12 text-neutral-7` |
| 页面 H1 | `text-title-28 font-medium text-neutral-10`（中文禁 font-bold） |
| 节标题 | `text-title-20 font-medium text-neutral-9` |
| Eyebrow | `text-caption-10 uppercase tracking-[1.5px] text-neutral-5` |
| 卡片 | `bg-neutral-2 dark:bg-neutral-2 rounded-lg p-4 ring-1 ring-border` |
| 主按钮 | accent 填充 + 白字，≤ 5% 表面 |
| 次按钮 | `bg-neutral-2 hover:bg-neutral-3 text-neutral-9 ring-1 ring-border` |
| 标签 / chip | `bg-neutral-2 text-neutral-7 text-label-12 px-2 py-0.5 rounded-md` |
| 代码块 | `bg-neutral-1 ring-1 ring-border rounded-md font-mono text-copy-13` |
| 引文 | 4px accent 左竖条，`text-neutral-7` |
| 分隔线 | `1px solid var(--color-border)` 或 `bg-neutral-3 h-px` |
| 图标旁文字 | `text-icon-sm`(14) / `text-icon-md`(16)，禁对图标用 `text-copy-*` |

> 记不住时：**n-9 承担正文，accent 承担焦点，n-2 承担表面，ring-border 承担分隔。**

## 在 Aether 项目中的开启方式

```css
/* 应用入口 */
@import 'tailwindcss';
@import '@aether/ui/tokens.css';

html {
  font-size: 14px;              /* 基准锚点 */
  letter-spacing: 0.01em;       /* 全局字距 */
}
```

约束要点：

1. **tokens 单一来源**：所有 hex 值只存在于 `tokens.css`；mockup / 组件代码一律引用 token，禁止内联 hex（戒律 10）。
2. **verify 自动拦截**：`pnpm --filter @aether/ui check`（`scripts/check.ts`）校验——cheatsheet 与 tokens.css 漂移、template 中的默认 `neutral-*`、内联 hex、硬编码 font-family。宿主应用再以 ESLint 拦截 `text-[Npx]` 与 Tailwind 默认 text 类。
3. **与品牌术语的关系**：Yohaku 约束视觉形态，Aether 术语约束信息架构，两者正交——Realm/Thread/Entity 的命名与数据结构不因视觉约束改变。
4. **Resonance 扩展**：第三方 Resonance 的 UI 同样受 Yohaku 约束，保证整个介质的视觉一致性。
5. **原生侧**：需要 JS 读取 token 时从 `@aether/ui/tokens` 导入（tokens.ts），light 值与 tokens.css 双源校验。

## 与官方实现的对齐说明

本包 `packages/@aether/ui` 是官方 `@yohaku/design-system`（v0.1）的忠实移植，差异仅限命名空间与包名：
- 官方语义色命名 `--color-info/success/warning/error`（非 PDF 早期版的 hanada/wakatake 命名）——本包采用官方命名。
- 官方 type scale 为 role+px 体系（caption/label/copy/title/display/icon），清空 Tailwind 默认 text 类——本包完全沿用。
- 深色模式通过 `@custom-variant dark` 实现，neutral 反转值在 tokens.ts 中集中管理。
- 官方 `templates/` 与 `references/`（CHEATSHEET、anti-patterns、typography、mockup-to-react）已并入本包与本文档，作为 AI 可读契约。
- `templates/scaffold.html` 与 `templates/snippets/`（hero / stat-grid / code-block / form / modal / sheet / comment-thread / list-card / logo 九个片段）已原样移植，仅将 `@yohaku/design-system` 命名替换为 `@aether/ui`；`pnpm --filter @aether/ui check` 会 lint 全部模板（禁默认 neutral 类、禁内联 hex、禁硬编码 font-family）。

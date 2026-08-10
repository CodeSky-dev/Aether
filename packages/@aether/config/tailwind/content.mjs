// @aether/config · Tailwind v4 content 扫描清单。
// Tailwind v4 由 @tailwindcss/vite 自动检测 content，但显式声明可约束边界、
// 避免将 node_modules / dist 误纳入扫描。供 @tailwindcss/vite 配置引用。
export const content = [
  '../../apps/**/*.{ts,tsx,html}',
  '../../packages/@aether/*/src/**/*.{ts,tsx,html}',
  '../../packages/@aether/ui/templates/**/*.html',
]

export default content

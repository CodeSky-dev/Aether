// @aether/config · Tailwind v4 Vite 插件装配。
// 返回 [tailwindcss(), { content }] 片段，供 Vite 8 应用/库配置展开。
import tailwindcss from '@tailwindcss/vite'
import { content } from './content.mjs'

export function tailwindVite() {
  return tailwindcss({ content })
}

export default tailwindVite

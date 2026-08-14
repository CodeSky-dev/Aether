// @aether/web · PostCSS 配置（Tailwind v4 Rust 引擎）
// content 扫描清单复用 @aether/config/tailwind/content，约束边界避免误扫 node_modules。
import { content } from '@aether/config/tailwind/content'

export default {
  plugins: {
    '@tailwindcss/postcss': {
      content,
    },
  },
}

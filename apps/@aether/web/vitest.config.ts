// @aether/web · Vitest 配置
// 与 Next.js 共享 tsconfig 路径别名；测试环境为 node（Server Actions 逻辑在服务端）。
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

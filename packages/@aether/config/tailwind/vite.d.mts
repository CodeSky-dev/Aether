// @aether/config · tailwind/vite 类型声明。
// vite.mjs 为纯 JS 产物，这里补充类型契约供消费方 TS 使用。
import type tailwindcss from '@tailwindcss/vite'

declare function tailwindVite(): ReturnType<typeof tailwindcss>

export default tailwindVite

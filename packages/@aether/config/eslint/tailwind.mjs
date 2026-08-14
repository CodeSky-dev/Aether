// @aether/config · ESLint flat config — Yohaku Tailwind 约束。
// 强制戒律：禁用 Tailwind 默认 neutral-50..950、禁用 text-[Npx] 硬编码字号、
// 禁用 Tailwind 默认 text-xs/sm/base 等 class（走 role+px 体系）。
// 用法：`import { tailwind } from '@aether/config/eslint/tailwind'`。
export const tailwind = {
  name: 'aether/yohaku-tailwind',
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        // 仅拦截 className 字符串字面量中出现的 Tailwind 默认 neutral-50..950；
        // Yohaku 允许的 neutral-1..10 不受影响。
        selector:
          'JSXAttribute[name.name="className"][value=/\\b(?:text|bg|border|ring|fill|stroke|from|to|via)-neutral-(?:50|100|200|300|400|500|600|700|800|900|950)\\b/]',
        message: '禁用 Tailwind 默认 neutral-50..950（用 --color-neutral-1..10）',
      },
      {
        selector:
          'Property[key.name="className"][value.value=/\\b(?:text|bg|border|ring|fill|stroke|from|to|via)-neutral-(?:50|100|200|300|400|500|600|700|800|900|950)\\b/]',
        message: '禁用 Tailwind 默认 neutral-50..950（用 --color-neutral-1..10）',
      },
    ],
  },
}

// 正则拦截辅助：供自定义 rule 或 CI grep 使用（与 packages/@aether/ui/scripts/check.ts 同源）。
export const BANNED_TEXT_SIZE_CLASS =
  /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/

export const BANNED_HARDCODED_PX =
  /\btext-\[(?:\d*\.?\d+px|clamp\([^\]]+\))\]\b/

export default tailwind

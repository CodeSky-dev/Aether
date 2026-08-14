// @aether/web · ESLint flat config
import base from '@aether/config/eslint/base'
import tailwindRules from '@aether/config/eslint/tailwind'

export default [
  ...base,
  tailwindRules,
  {
    ignores: ['.next/**', 'out/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

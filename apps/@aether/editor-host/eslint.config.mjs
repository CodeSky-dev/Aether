// @aether/editor-host · ESLint flat config。
import base from '@aether/config/eslint/base'

export default [
  ...base,
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

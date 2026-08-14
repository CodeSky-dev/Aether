// @aether/converge-server · ESLint flat config
import base from '@aether/config/eslint/base'

export default [
  ...base,
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]

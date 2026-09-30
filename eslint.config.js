import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'docs/.vitepress/cache',
      'docs/.vitepress/dist',
      'docs/api',
      'examples/*/.next',
      'examples/*/dist',
      'examples/*/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/react/**/*.tsx', 'examples/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
)

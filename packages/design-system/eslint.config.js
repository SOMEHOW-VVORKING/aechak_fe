import baseConfig from '@aechak/eslint-config'

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
]

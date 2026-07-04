import baseConfig from '@aechak/eslint-config'
import boundariesPlugin from 'eslint-plugin-boundaries'

export default [
  ...baseConfig,
  {
    plugins: {
      boundaries: boundariesPlugin,
    },
    settings: {
      'boundaries/elements': [
        { type: 'feature', pattern: 'src/features/*' },
        { type: 'shared', pattern: 'src/shared/*' },
        { type: 'app', pattern: 'src/app' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: ['feature'], allow: ['shared'] },
            { from: ['shared'], allow: [] },
            { from: ['app'], allow: ['feature', 'shared'] },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'scripts/**'],
  },
]

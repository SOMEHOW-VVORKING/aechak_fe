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
        { type: 'feature', pattern: 'features/*' },
        { type: 'shared', pattern: 'components/*' },
        { type: 'app', pattern: 'app' },
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
    ignores: [
      'node_modules/**',
      '.expo/**',
      'metro.config.js',
      'tailwind.config.js',
      'babel.config.js',
      'jest.config.js',
    ],
  },
]

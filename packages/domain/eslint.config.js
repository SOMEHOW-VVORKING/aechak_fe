import baseConfig from '@aechak/eslint-config'

export default [
  ...baseConfig,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react-native'], message: 'domain 패키지는 UI 라이브러리를 import할 수 없습니다.' },
            { group: ['@tanstack/*'], message: 'domain 패키지는 상태/쿼리 라이브러리를 import할 수 없습니다.' },
            { group: ['zustand', 'zustand/*'], message: 'domain 패키지는 상태/쿼리 라이브러리를 import할 수 없습니다.' },
          ],
        },
      ],
    },
  },
]

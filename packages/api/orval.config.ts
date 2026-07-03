import { defineConfig } from 'orval'

export default defineConfig({
  aechak: {
    input: {
      target: './openapi/schema.yaml',
    },
    output: {
      target: './src/generated/api.ts',
      client: 'react-query',
      httpClient: 'axios',
      override: {
        mutator: {
          path: './src/client.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useSuspenseQuery: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
})

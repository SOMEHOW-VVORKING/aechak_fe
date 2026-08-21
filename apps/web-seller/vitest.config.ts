import { configDefaults, mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      // vitest 기본 include(**/*.spec.*)가 Playwright spec을 집어삼키면 @playwright/test
      // import에서 전체 테스트가 깨진다 — e2e는 Playwright 소관(web-buyer와 동일 수정).
      exclude: [...configDefaults.exclude, 'e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
  }),
)

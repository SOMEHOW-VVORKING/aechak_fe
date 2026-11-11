import { configDefaults, mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      // CI 러너에서 세 앱 suite가 동시에 돌아 CPU를 나눠 쓰면 기본 5초를 넘는 테스트가 무작위로 나온다.
      testTimeout: 15_000,
      // e2e/는 Playwright 전용 — vitest 기본 include(**/*.spec.*)가 집어삼키면
      // @playwright/test import에서 전체 테스트가 깨진다.
      exclude: [...configDefaults.exclude, 'e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
      },
    },
  }),
)

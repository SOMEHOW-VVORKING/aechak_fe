import { defineConfig, devices } from '@playwright/test'

// 5173을 다른 워크트리의 dev 서버가 쥐고 있으면 reuseExistingServer가 그 브랜치의 앱을 테스트한다 —
// 내 변경이 없는 화면을 보면서 "통과"를 읽는다(실측으로 겪었다). 포트를 비켜 돌릴 수 있게 baseURL과
// webServer를 함께 환경변수로 뺀다. spec의 CORS 스텁도 같은 `E2E_BASE_URL`을 origin으로 읽으므로
// 한 값만 주면 전부 따라온다. CI는 변수를 주지 않아 5173 그대로다.
// `--strictPort`를 붙여, 지정한 포트가 막혀 있으면 조용히 다른 포트로 옮겨 가지 말고 터지게 한다.
const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173'
const PORT = new URL(BASE_URL).port || '5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `pnpm dev`가 아니라 vite를 직접 부른다 — dev 스크립트가 `--port 5173`을 이미 박아 두어
    // 뒤에 또 붙이면 같은 플래그가 두 번 들어간다.
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
  },
})

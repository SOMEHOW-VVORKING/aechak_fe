import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5175',
    // 로컬은 retries 0이라 'on-first-retry'로는 아무것도 안 남았다 —
    // 실패 진단이 로컬에서도 남게 실패 시 아티팩트를 보존한다.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // WebKit/Firefox 프로젝트는 추가하지 않는다 — 해당 브라우저가 설치돼 있지
  // 않아 test:e2e가 깨진다. chromium 단일 유지(WebKit 커버리지는 후속 과제).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // dev와 동일하되 --strictPort로 고정 — 포트 충돌 시 조용히 5176으로
    // 드리프트해 url 대기가 타임아웃 나는 걸 막는다.
    command: 'pnpm exec vite --port 5175 --strictPort',
    url: 'http://localhost:5175',
    // 주의: 5175는 공유 포트라, reuseExistingServer가 켜진 로컬에서는 다른
    // 앱이 5175에 이미 떠 있으면 그 서버를 그대로 재사용할 수 있다.
    reuseExistingServer: !process.env['CI'],
  },
})

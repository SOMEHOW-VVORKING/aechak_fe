import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    // 로컬은 retries 0이라 'on-first-retry'로는 아무것도 안 남았다 —
    // 실패 진단이 로컬에서도 남게 실패 시 아티팩트를 보존한다(web-buyer 선례).
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // 어드민 콘솔은 데스크톱 전용 화면이라 Desktop Chrome 단일로 둔다(WebKit/Firefox는
  // 해당 브라우저가 설치돼 있지 않아 test:e2e가 깨진다).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // dev와 동일하되 --strictPort로 고정 — 포트 충돌 시 조용히 5175로 드리프트해
    // url 대기가 타임아웃 나는 걸 막는다.
    command: 'pnpm exec vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env['CI'],
  },
})

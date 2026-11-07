import { defineConfig, devices } from '@playwright/test'

// 포트를 비켜 돌릴 수 있게 baseURL과 webServer를 함께 환경변수로 뺀다(web-seller와 같은 방식).
// spec의 CORS 스텁도 같은 `E2E_BASE_URL`을 origin으로 읽으므로 한 값만 주면 전부 따라온다 —
// 두 곳이 어긋나면 세션 복원 스텁이 조용히 무력화되고 화면이 비회원처럼 그려진다.
// CI는 변수를 주지 않아 5174 그대로다.
const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5174'
const PORT = new URL(BASE_URL).port || '5174'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
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
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
  },
})

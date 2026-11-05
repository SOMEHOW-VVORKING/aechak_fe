import { defineConfig, devices } from '@playwright/test'

// 포트를 비켜 돌릴 수 있게 baseURL과 webServer를 함께 환경변수로 뺀다(web-seller와 같은 방식).
// spec의 CORS 스텁도 같은 `E2E_BASE_URL`을 origin으로 읽으므로 한 값만 주면 전부 따라온다 —
// 두 곳이 어긋나면 세션 복원 스텁이 조용히 무력화된다(e2e/session.ts 주석 참고).
// CI는 변수를 주지 않아 5175 그대로다.
const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const PORT = new URL(BASE_URL).port || '5175'

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
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    // 주의: 기본 포트는 공유 포트라, reuseExistingServer가 켜진 로컬에서는 다른 워크트리의
    // dev 서버가 이미 떠 있으면 그 브랜치의 앱을 테스트한다. 그때 `E2E_BASE_URL`로 비켜 준다.
    reuseExistingServer: !process.env['CI'],
  },
})

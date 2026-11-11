import { test, expect, type Route } from '@playwright/test'
import { stubGuestSession, stubMemberSession } from './session'

// 설정 홈 로그아웃 ↔ 서버 세션 종료(POST /auth/web/logout) E2E. 실백엔드 없이 page.route
// 스텁으로 재현한다(교차 출처 + withCredentials — CORS 헤더 필수, pet-breeds 관례).

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillEmpty(route: Route, status: number) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS })
}

test('[AC-LOGOUT-E2E-001] 로그아웃 확인 → 서버 로그아웃 호출 → 홈 가드가 로그인 화면으로', async ({
  page,
}) => {
  let logoutCalls = 0
  await page.route('**/api/v1/auth/web/logout', route => {
    if (route.request().method() === 'POST') logoutCalls += 1
    return fulfillEmpty(route, 204)
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: '로그아웃' }).click()
  // Modal 확인 버튼(같은 라벨이 둘 — 마지막이 Modal 쪽).
  await page.getByRole('button', { name: '로그아웃' }).last().click()

  // 로그아웃은 홈으로 보내고, 홈 가드가 로그아웃 상태를 보고 /home 없이 로그인 화면으로 넘긴다.
  await expect(page).toHaveURL(`${ORIGIN}/onboarding/login`)
  await expect(page.getByRole('button', { name: '카카오 로그인' })).toBeVisible()
  expect(logoutCalls).toBeGreaterThanOrEqual(1)
})

test('[AC-LOGOUT-E2E-002] 로그아웃한 뒤 새로고침해도 다시 로그인 상태가 되지 않는다', async ({
  page,
}) => {
  // 예전에는 로그인 여부가 모듈 변수 기본값 true라 새로고침만 하면 로그아웃이 되돌려졌다.
  // 이제 정본은 세션 자체다 — 서버 로그아웃이 refresh 쿠키를 만료시키므로 새 문서 로드의
  // 세션 확인은 401이고, 그 결론이 비회원이어야 한다.
  await stubMemberSession(page)
  await page.route('**/api/v1/auth/web/logout', route => fulfillEmpty(route, 204))

  await page.goto('/settings')
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.getByRole('button', { name: '로그아웃' }).last().click()
  await expect(page).toHaveURL(`${ORIGIN}/onboarding/login`)

  // 쿠키가 만료된 뒤의 새 문서 로드.
  await stubGuestSession(page)
  await page.goto('/')

  await expect(page).toHaveURL(`${ORIGIN}/onboarding/login`)
  await expect(page.getByRole('button', { name: '카카오 로그인' })).toBeVisible()
})

import { test, expect, type Route } from '@playwright/test'

// 설정 홈 로그아웃 ↔ 서버 세션 종료(POST /auth/web/logout) E2E. 실백엔드 없이 page.route
// 스텁으로 재현한다(교차 출처 + withCredentials — CORS 헤더 필수, pet-breeds 관례).

const ORIGIN = 'http://localhost:5175'
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

test('[AC-LOGOUT-E2E-001] 로그아웃 확인 → 서버 로그아웃 호출 → 홈 복귀 + 비회원 전환', async ({
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

  await expect(page).toHaveURL(`${ORIGIN}/`)
  expect(logoutCalls).toBeGreaterThanOrEqual(1)

  // 비회원 전환 확인 — 회원 전용 액션(홈 추천 캐러셀 찜 하트, 목업 데이터라 추가 스텁 불요)이
  // 로그인 게이트를 띄운다. 리로드하면 mock 로그인 플래그가 리셋되므로 같은 SPA 세션에서 확인한다.
  await page.getByRole('button', { name: '찜하기' }).first().click()
  await expect(page.getByText('로그인이 필요해요')).toBeVisible()
})

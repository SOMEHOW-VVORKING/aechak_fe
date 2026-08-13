import { test, expect, type Page, type Route } from '@playwright/test'

// 카카오 웹 로그인(서버 콜백) + 입점 신청 연동 E2E — web-seller 첫 Playwright spec.
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다. 페이지(5173) → API(8080)가 교차
// 출처 + withCredentials라 fulfill 응답에 CORS 헤더(정확한 origin)가 필요하다(web-buyer 관례).

const ORIGIN = 'http://localhost:5173'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

/** refresh(200) — 로그인 완료 복귀와 세션 유지를 재현한다. */
async function stubSession(page: Page) {
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 200, { data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 } }),
  )
}

/** 입점 신청을 상태 있게 스텁한다(없음 → 저장 → DRAFT). */
async function stubSellerApplication(page: Page) {
  let application: Record<string, unknown> | null = null

  await page.route('**/api/v1/seller-applications', async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfillJson(route, 204, null)
    if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      application = {
        applicationId: 1,
        status: 'DRAFT',
        businessType: body['businessType'],
        businessName: body['businessName'] ?? null,
        businessRegNo: body['businessRegNo'] ?? null,
        corpRegNo: body['corpRegNo'] ?? null,
        representativeName: body['representativeName'] ?? null,
        telesalesNumber: body['telesalesNumber'] ?? null,
        bankCode: body['bankCode'] ?? null,
        accountNumberMasked: body['accountNumber'] ? '********6789' : null,
        accountHolder: body['accountHolder'] ?? null,
        appliedAt: '2026-08-13T09:00:00',
        submittedAt: null,
        decidedAt: null,
        rejectionReason: null,
        documents: [],
      }
      return fulfillJson(route, 200, { data: application })
    }
    if (application == null) {
      return fulfillJson(route, 404, { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' })
    }
    return fulfillJson(route, 200, { data: application })
  })
}

test('[AC-SELLER-E2E-001] 카카오 로그인 복귀 → 대시보드 → 입점 신청 폼 임시저장', async ({ page }) => {
  await stubSession(page)
  await stubSellerApplication(page)
  // 로그인 진입은 페이지 이동(302) — 서버 인가 화면 대신 바로 복귀 주소로 되돌린다.
  await page.route('**/api/v1/auth/login/kakao/redirect*', route =>
    route.fulfill({
      status: 302,
      headers: { Location: `${ORIGIN}/login/complete?status=ACTIVE&isNew=false` },
    }),
  )

  await page.goto('/login')
  await page.getByRole('button', { name: '카카오로 로그인' }).click()

  // /login/complete가 refresh로 access를 수령하고 대시보드로 보낸다.
  await expect(page).toHaveURL(`${ORIGIN}/`)

  // SPA 내비게이션으로 스토어 설정 진입 — 신청 이력 없음(404/10100) = 신규 신청 폼.
  await page.getByRole('button', { name: '스토어 설정' }).click()
  await expect(page.getByText('작성 전')).toBeVisible()
  await expect(page.getByRole('button', { name: '제출하기' })).toBeDisabled()

  // 최소 입력 후 임시저장 — 폼 전체가 실려 나가고 응답(DRAFT)으로 화면이 재구성된다.
  await page.getByLabel('예금주').fill('정지은')
  await page.getByRole('button', { name: '임시저장' }).click()
  await expect(page.getByText('저장했어요.')).toBeVisible()
  await expect(page.getByText('작성 중', { exact: true })).toBeVisible()
})

test('[AC-SELLER-E2E-002] 세션 없이 스토어 설정 진입(401 → refresh 실패)이면 로그인으로 튕긴다', async ({
  page,
}) => {
  await page.route('**/api/v1/seller-applications', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' }),
  )
  // 401을 받은 인터셉터가 refresh를 시도한다. 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' }),
  )

  await page.goto('/store-settings')
  await expect(page).toHaveURL(/\/login\/?$/)
  await expect(page.getByRole('button', { name: '카카오로 로그인' })).toBeVisible()
})

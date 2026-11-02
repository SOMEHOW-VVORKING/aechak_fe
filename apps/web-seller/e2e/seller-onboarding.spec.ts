import { test, expect, type Page, type Route } from '@playwright/test'

// 카카오 웹 로그인(서버 콜백) + 입점 신청 연동 E2E — web-seller 첫 Playwright spec.
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다. 페이지(5173)에서 API로 가는 요청이
// 교차 출처 + withCredentials라 fulfill 응답에 CORS 헤더(정확한 origin)가 필요하다(web-buyer 관례).
//
// 글롭에 origin을 적는 이유: 인증은 api 모듈(8080), 입점 신청은 seller 모듈(8081)이 소유한다.
// `**/api/v1/...`로 두면 요청이 엉뚱한 모듈로 나가도 같은 스텁이 받아 주어, 배포에서만 드러나는
// 호스트 오배치를 브라우저 테스트가 놓친다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173'
const API_ORIGIN = 'http://localhost:8080'
const SELLER_ORIGIN = 'http://localhost:8081'
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
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 200, { data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 } }),
  )
}

/**
 * 랜딩(`/`)이 부르는 대시보드 집계 — 이 spec의 관심사는 아니지만 스텁하지 않으면 실네트워크로
 * 나간다. 값은 보지 않으므로 빈 집계로 내린다(대시보드 자체 검증은 seller-dashboard.spec.ts).
 */
async function stubDashboardSummary(page: Page) {
  const zero = { value: 0, previousValue: null, supported: true }
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/dashboard/summary*`, route =>
    fulfillJson(route, 200, {
      data: {
        metrics: {
          newOrders: zero,
          awaitingShipment: zero,
          shippingDelayed: zero,
          cancelRequests: zero,
          returnRequests: zero,
          exchangeRequests: zero,
          collectionInvoicePending: zero,
          collectionCompletionPending: zero,
          reshipPending: zero,
          unansweredInquiries: { value: 0, previousValue: null, supported: false },
        },
        settlement: { totalAmount: 0, pendingAmount: 0, onHoldAmount: 0 },
        productStatuses: { awaitingInspection: 0, rejected: 0, suspended: 0, soldOut: 0 },
      },
    }),
  )
}

/** 입점 신청을 상태 있게 스텁한다(없음 → 저장 → DRAFT). */
async function stubSellerApplication(page: Page) {
  let application: Record<string, unknown> | null = null

  await page.route(`${SELLER_ORIGIN}/api/v1/seller-applications`, async route => {
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

/** 승인된 셀러 — 가드를 통과해 운영 화면까지 들어가는 쪽을 재현한다. */
async function stubApprovedApplication(page: Page) {
  await page.route(`${SELLER_ORIGIN}/api/v1/seller-applications`, route =>
    fulfillJson(route, 200, {
      data: {
        applicationId: 1,
        status: 'APPROVED',
        businessType: 'PERSONAL_GENERAL',
        businessName: null,
        businessRegNo: null,
        corpRegNo: null,
        representativeName: '정지은',
        telesalesNumber: null,
        bankCode: '004',
        accountNumberMasked: '********6789',
        accountHolder: '정지은',
        appliedAt: '2026-08-13T09:00:00',
        submittedAt: '2026-08-13T10:00:00',
        decidedAt: '2026-08-14T10:00:00',
        rejectionReason: null,
        documents: [],
      },
    }),
  )
}

// 승인 뒤의 스토어 설정은 GET /sellers/me/store 를 실서버에서 받아 그린다(SCRUM-355).
// 이 스텁이 없으면 그 호출이 라우트에 걸리지 않아 화면이 빈 채로 남는다.
async function stubSellerStore(page: Page) {
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/store`, route =>
    fulfillJson(route, 200, {
      data: {
        isSeller: true,
        applicationStatus: 'APPROVED',
        store: {
          sellerId: 1,
          status: 'ACTIVE',
          storeName: '보리펫샵',
          brandIntro: null,
          profileImageUrl: null,
          profileImageKey: null,
          bannerImageUrl: null,
          bannerImageKey: null,
          zipCode: null,
          roadAddress: null,
          detailAddress: null,
          confirmedOrderCount: 0,
          telesalesNoticeStatus: 'NOT_REQUIRED',
        },
      },
    }),
  )
}

/** 로그인 진입은 페이지 이동(302) — 서버 인가 화면 대신 바로 복귀 주소로 되돌린다. */
async function stubKakaoRedirect(page: Page) {
  await page.route(`${API_ORIGIN}/api/v1/auth/login/kakao/redirect*`, route =>
    route.fulfill({
      status: 302,
      headers: { Location: `${ORIGIN}/login/complete?status=ACTIVE&isNew=false` },
    }),
  )
}

test('[AC-SELLER-E2E-001] 신청 이력이 없는 계정은 로그인 복귀 뒤 입점 신청 폼에서 임시저장한다', async ({
  page,
}) => {
  await stubSession(page)
  await stubSellerApplication(page)
  await stubKakaoRedirect(page)

  await page.goto('/login')
  await page.getByRole('button', { name: '카카오로 로그인' }).click()

  // /login/complete는 대시보드(`/`)로 보내지만 __root 가드가 신청 이력 없음(404/10100)을 보고
  // 입점 신청으로 돌린다. 대시보드를 거치지 않는 것이 이 가드의 요점이라 여기서 `/`를 기대하면
  // 안 된다 — 미승인 계정이 운영 화면을 한 번이라도 보면 가드가 뚫린 것이다.
  await expect(page).toHaveURL(`${ORIGIN}/store-settings`)
  await expect(page.getByText('작성 전')).toBeVisible()
  await expect(page.getByRole('button', { name: '제출하기' })).toBeDisabled()

  // 최소 입력 후 임시저장 — 폼 전체가 실려 나가고 응답(DRAFT)으로 화면이 재구성된다.
  await page.getByLabel('예금주').fill('정지은')
  await page.getByRole('button', { name: '임시저장' }).click()
  await expect(page.getByText('저장했어요.')).toBeVisible()
  await expect(page.getByText('작성 중', { exact: true })).toBeVisible()
})

test('[AC-SELLER-E2E-003] 승인된 셀러는 로그인 복귀 뒤 대시보드에 들어가고 nav로 스토어 설정에 간다', async ({
  page,
}) => {
  await stubSession(page)
  await stubApprovedApplication(page)
  await stubSellerStore(page)
  await stubDashboardSummary(page)
  await stubKakaoRedirect(page)

  await page.goto('/login')
  await page.getByRole('button', { name: '카카오로 로그인' }).click()

  // 화면 표식을 먼저 보고 주소를 그 뒤에 단언한다 — 주소만 보면 가드가 끝나기 전에 스쳐 간 `/`로
  // 통과할 수 있다(단위 스펙이 settled 뒤 한 번만 보는 것과 같은 이유). 표식이 뜬 뒤에도 `/`에
  // 남아 있어야 비로소 "승인된 셀러를 들여보냈다"가 된다.
  //
  // 표식은 대시보드가 집계 응답을 받고 그리는 지표 이름이다. SCRUM-292가 진입 차단을 걷고
  // 실 데이터를 그리게 바꾸면서 "준비 중" 안내가 사라졌으므로 그 문구로는 더 이상 가릴 수 없다.
  await expect(page.getByText('신규 주문')).toBeVisible()
  await expect(page).toHaveURL(`${ORIGIN}/`)

  // SPA 내비게이션 — 승인 계정이라 스토어 설정은 신청 폼이 아니라 스토어 정보를 보여준다.
  // 표식을 '승인 완료' pill 이 아니라 상호 칸의 값으로 고른 이유: pill 은 신청 상태만 말하고
  // 서버에서 받은 스토어를 그렸다는 것을 증명하지 못한다. 칸에 값이 들어와 있으면 GET이 돌았고
  // 그 응답으로 폼이 시드됐다는 뜻이다.
  await page.getByRole('button', { name: '스토어 설정' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/store-settings`)
  await expect(page.getByLabel('상호(스토어명)')).toHaveValue('보리펫샵')
})

test('[AC-SELLER-E2E-002] 세션 없이 스토어 설정 진입(401 → refresh 실패)이면 로그인으로 튕긴다', async ({
  page,
}) => {
  await page.route(`${SELLER_ORIGIN}/api/v1/seller-applications`, route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' }),
  )
  // 401을 받은 인터셉터가 refresh를 시도한다. 성공으로 새면 안 튕기므로 refresh도 401 고정.
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' }),
  )

  await page.goto('/store-settings')
  await expect(page).toHaveURL(/\/login\/?$/)
  await expect(page.getByRole('button', { name: '카카오로 로그인' })).toBeVisible()
})

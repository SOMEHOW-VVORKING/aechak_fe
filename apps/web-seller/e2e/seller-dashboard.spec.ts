import { test, expect, type Page, type Route } from '@playwright/test'

// 셀러센터 대시보드 실 연동 E2E — 랜딩 집계를 브라우저에서 고정한다.
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다. 글롭에 origin을 적는 이유는
// 인증이 api 모듈(8080), 대시보드 집계가 seller 모듈(8081) 소유라서다 — `**/api/v1/...`로 두면
// 요청이 엉뚱한 모듈로 나가도 같은 스텁이 받아 주어 호스트 오배치를 브라우저 테스트가 놓친다.
//
// 카드 → 목록 동선은 목적지(`/orders`·`/claims`)가 실서버에 붙어(SCRUM-291·295) 빌드 상수
// (`shared/serverAvailability`)가 올라간 뒤로 브라우저에서 끝까지 따라갈 수 있다 — 카드가 버튼으로
// 올라오고, 누르면 단계 축만 실어 목록으로 넘어간다(기간은 싣지 않는다).

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

const metric = (value: number, previousValue: number | null = null) => ({
  value,
  previousValue,
  supported: true,
})

/** 요청에 실린 period를 기록하면서 집계를 내린다. */
async function stubDashboard(page: Page, periods: string[]) {
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 200, {
      data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/dashboard/summary*`, route => {
    const period = new URL(route.request().url()).searchParams.get('period')
    periods.push(period ?? '(없음)')
    // 전체 기간에는 비교할 직전 구간이 없어 previousValue가 null이다.
    const hasPrevious = period != null && period !== 'all'
    const prev = (n: number) => (hasPrevious ? n : null)
    return fulfillJson(route, 200, {
      data: {
        metrics: {
          newOrders: metric(7, prev(2)),
          awaitingShipment: metric(6, prev(1)),
          shippingDelayed: metric(2, prev(0)),
          cancelRequests: metric(5, prev(3)),
          returnRequests: metric(4, prev(1)),
          exchangeRequests: metric(3, prev(1)),
          collectionInvoicePending: metric(9, prev(4)),
          collectionCompletionPending: metric(8, prev(2)),
          reshipPending: metric(11, prev(5)),
          unansweredInquiries: { value: 0, previousValue: null, supported: false },
        },
        settlement: { totalAmount: 360000, pendingAmount: 312000, onHoldAmount: 48000 },
        productStatuses: { awaitingInspection: 2, rejected: 1, suspended: 1, soldOut: 3 },
      },
    })
  })
}

test('[AC-SELLER-E2E-003] 랜딩이 처리 대기 10지표를 그리고 기간을 바꾸면 서버에 period가 실린다', async ({
  page,
}) => {
  const periods: string[] = []
  await stubDashboard(page, periods)

  await page.goto('/')

  // 승인 이후 세 단계가 각각 자기 숫자를 갖는다(값은 지표마다 달라 뒤섞이면 드러난다).
  await expect(page.getByText('회수 송장 등록 대기')).toBeVisible()
  await expect(page.getByText('회수 완료 처리 대기')).toBeVisible()
  await expect(page.getByText('재발송 대기')).toBeVisible()
  await expect(page.getByText('9', { exact: true })).toBeVisible()
  await expect(page.getByText('8', { exact: true })).toBeVisible()
  await expect(page.getByText('11', { exact: true })).toBeVisible()
  // 집계 불가 지표는 0건이 아니라 사유를 쓴다.
  await expect(page.getByText('집계 준비 중')).toBeVisible()
  // 기간과 무관한 스냅샷은 묶음 제목으로 갈라 둔다.
  await expect(page.getByRole('heading', { name: '지금 기준 스냅샷' })).toBeVisible()
  await expect(page.getByText('360,000원')).toBeVisible()

  // 전체 기간은 파라미터 자체를 보내지 않는다.
  expect(periods).toEqual(['(없음)'])

  await page.getByRole('combobox', { name: '기간' }).selectOption('7d')

  await expect(page.getByText('직전 7일 요청분 중 4건 남음')).toBeVisible()
  expect(periods).toContain('7d')
})

test('[AC-SELLER-E2E-004] 카드를 누르면 단계 축만 실어 목록으로 넘어간다', async ({ page }) => {
  const periods: string[] = []
  await stubDashboard(page, periods)
  // 목적지 목록은 빈 페이지로 받는다 — 여기서 고정할 것은 "어디로 가며 무엇을 싣는가"다.
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/orders*`, route =>
    fulfillJson(route, 200, {
      data: { orders: [], totalCount: 0, page: 0, size: 20, totalPages: 0, hasNext: false },
    }),
  )

  await page.goto('/')
  await expect(page.getByText('신규 주문')).toBeVisible()

  // 목적지가 열려 있으니 카드가 버튼으로 올라오고 그렇게 안내한다.
  await expect(page.getByText(/카드를 누르면 그 단계의 목록이 열려요/)).toBeVisible()

  // 기간을 고르면 두 화면의 기간 단위가 달라 숫자가 어긋날 수 있다고 미리 알린다.
  await page.getByRole('combobox', { name: '기간' }).selectOption('30d')
  await expect(page.getByText('직전 30일 요청분 중 4건 남음')).toBeVisible()
  await expect(page.getByText(/목록이 카드보다 많이 보일 수 있어요/)).toBeVisible()

  // 목록 조회가 나가는 것을 기다려 잡는다(클릭 직후 단언하면 요청 전에 읽는다).
  const listRequest = page.waitForRequest(request =>
    request.url().includes('/api/v1/sellers/me/orders'),
  )
  await page.getByRole('button', { name: /신규 주문/ }).click()

  await expect(page).toHaveURL(`${ORIGIN}/orders?status=new`)
  const listQuery = new URL((await listRequest).url()).search

  // 단계 축은 싣고(status=new) 기간은 싣지 않는다 — 카드의 기간은 시각 단위, 목록 필터는 날짜
  // 단위라 함께 넘기면 숫자가 어긋난다.
  expect(listQuery).toContain('status=new')
  expect(listQuery).not.toContain('period')
  expect(listQuery).not.toContain('30d')
})

test('[AC-SELLER-E2E-005] 집계 조회가 실패하면 빈 상태가 아니라 오류로 드러난다', async ({ page }) => {
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 200, {
      data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/dashboard/summary*`, route =>
    fulfillJson(route, 500, { errorCode: 90000, message: '서버 오류가 발생했습니다.' }),
  )

  await page.goto('/')

  await expect(page.getByText('집계를 불러오지 못했어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible()
  await expect(page.getByText('신규 주문')).toHaveCount(0)
})

test('[AC-SELLER-E2E-006] 자격 없는 셀러(403)는 재시도 버튼 없이 접근 불가로 안내한다', async ({
  page,
}) => {
  let requests = 0
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 200, {
      data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/dashboard/summary*`, route => {
    requests += 1
    return fulfillJson(route, 403, {
      errorCode: 10003,
      message: '셀러센터를 조회할 권한이 없습니다.',
    })
  })

  await page.goto('/')

  await expect(page.getByText('셀러센터를 열 수 없어요')).toBeVisible()
  // 다시 보내도 같은 답이라 재시도 버튼도, 뜻 없는 기간 필터도 두지 않는다.
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByText('집계를 불러오지 못했어요')).toHaveCount(0)
  // 4xx는 자동 재시도하지 않는다 — 클릭 한 번 없이 두 번 나가면 안 된다.
  expect(requests).toBe(1)
})

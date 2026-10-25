import { test, expect, type Page, type Route } from '@playwright/test'

// 셀러센터 대시보드 실 연동 E2E — 랜딩 집계와 카드 → 목록 동선을 브라우저에서 고정한다.
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다. 글롭에 origin을 적는 이유는
// 인증이 api 모듈(8080), 대시보드 집계가 seller 모듈(8081) 소유라서다 — `**/api/v1/...`로 두면
// 요청이 엉뚱한 모듈로 나가도 같은 스텁이 받아 주어 호스트 오배치를 브라우저 테스트가 놓친다.

const ORIGIN = 'http://localhost:5173'
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

  // 승인 이후 세 단계가 각각 자기 숫자를 갖는다.
  await expect(page.getByRole('button', { name: /회수 송장 등록 대기/ })).toContainText('9')
  await expect(page.getByRole('button', { name: /회수 완료 처리 대기/ })).toContainText('8')
  await expect(page.getByRole('button', { name: /재발송 대기/ })).toContainText('11')
  // 집계 불가 지표는 0건이 아니라 사유를 쓴다.
  await expect(page.getByText('집계 준비 중')).toBeVisible()

  // 전체 기간은 파라미터 자체를 보내지 않는다.
  expect(periods).toEqual(['(없음)'])

  await page.getByRole('combobox').selectOption('7d')

  await expect(page.getByText('직전 7일 요청분 중 4건 남음')).toBeVisible()
  expect(periods).toContain('7d')
})

test('[AC-SELLER-E2E-004] 카드를 누르면 단계 축만 실어 목록으로 넘어간다(기간 미전달)', async ({
  page,
}) => {
  const periods: string[] = []
  await stubDashboard(page, periods)

  await page.goto('/')
  // 기간을 고른 상태에서 눌러도 목적지에 기간이 실리지 않아야 한다.
  await page.getByRole('combobox').selectOption('30d')
  await expect(page.getByText(/목록이 카드보다 많이 보일 수 있어요/)).toBeVisible()

  await page.getByRole('button', { name: /회수 완료 처리 대기/ }).click()

  await expect(page).toHaveURL(`${ORIGIN}/claims?pendingStage=COLLECTION_COMPLETION_PENDING`)

  await page.goBack()
  await page.getByRole('button', { name: /신규 주문/ }).click()

  await expect(page).toHaveURL(`${ORIGIN}/orders?status=new`)
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

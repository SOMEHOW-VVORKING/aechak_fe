import { test, expect, type Page, type Route } from '@playwright/test'
import type { CompletePaymentEnvelope, PreparePaymentEnvelope } from '@aechak/api'

// 결제 결과(b1-st-5) ↔ POST /order-groups/{id}/payment/complete·prepare 연동 E2E. 실백엔드·실PG 없이
// page.route 스텁으로 서버 계약을 재현하고, 포트원 SDK는 window.PortOne을 미리 심어 CDN 로드를 막는다
// (npm `/v2` 엔트리는 window.PortOne이 이미 있으면 cdn.portone.io 스크립트를 주입하지 않는다).

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'
const OG = '01JPAYE2E00000000000000001'
const RESULT_URL = `/payment/result?orderGroupId=${OG}&method=kakaopay`

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

const paid = (finalPaymentAmount: number): CompletePaymentEnvelope => ({
  data: { status: 'PAID', orderGroupId: OG, finalPaymentAmount, usedPoint: 0, failureCode: null },
})
const failed = (failureCode: string | null): CompletePaymentEnvelope => ({
  data: {
    status: 'FAILED',
    orderGroupId: OG,
    finalPaymentAmount: 64000,
    usedPoint: 0,
    failureCode,
  },
})
const PREPARED: PreparePaymentEnvelope = {
  data: { paymentId: OG, targetAmount: 64000, storeId: 'store-e2e', channelKey: 'channel-key-e2e' },
}

interface PortOneStub {
  code?: string
  message?: string
}

// 결제창 스텁 — 요청을 window.__portoneRequests에 쌓고, code가 있으면 실패/취소 응답을 돌려준다.
async function stubPortOne(page: Page, stub: PortOneStub = {}) {
  await page.route('https://cdn.portone.io/**', route => route.abort())
  await page.addInitScript((seed: PortOneStub) => {
    const w = window as unknown as {
      __portoneRequests: unknown[]
      PortOne: { requestPayment: (req: { paymentId: string }) => Promise<unknown> }
    }
    w.__portoneRequests = []
    w.PortOne = {
      requestPayment: async req => {
        w.__portoneRequests.push(req)
        const base = { transactionType: 'PAYMENT', txId: 'tx-e2e', paymentId: req.paymentId }
        return seed.code ? { ...base, code: seed.code, message: seed.message } : base
      },
    }
  }, stub)
}

async function stubSession(page: Page) {
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
}

// complete는 호출 순서대로 응답을 소비하고 마지막 값을 반복한다(MSW 시드와 같은 규칙).
async function stubComplete(page: Page, sequence: Array<{ status: number; json: unknown }>) {
  let calls = 0
  await page.route(`**/api/v1/order-groups/${OG}/payment/complete`, route => {
    if (route.request().method() !== 'POST') return fulfill(route, 204)
    const step = sequence[Math.min(calls, sequence.length - 1)]!
    calls += 1
    return fulfill(route, step.status, step.json)
  })
  return () => calls
}

async function stubPrepare(page: Page) {
  let calls = 0
  await page.route(`**/api/v1/order-groups/${OG}/payment/prepare`, route => {
    if (route.request().method() !== 'POST') return fulfill(route, 204)
    calls += 1
    return fulfill(route, 201, PREPARED)
  })
  return () => calls
}

test('[AC-PAYMENT-E2E-001] PAID면 완료 화면에 주문번호·결제금액을 보이고 complete는 한 번만 나간다', async ({
  page,
}) => {
  await stubSession(page)
  await stubPortOne(page)
  const completeCalls = await stubComplete(page, [{ status: 200, json: paid(61000) }])

  await page.goto(RESULT_URL)

  await expect(page.getByText('결제가 완료되었어요')).toBeVisible()
  await expect(page.getByText(OG)).toBeVisible()
  await expect(page.getByText('61,000원')).toBeVisible()
  await expect(page.getByRole('button', { name: '뒤로 가기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '주문 내역 보기' })).toBeVisible()
  // dev StrictMode 이중 마운트에서도 그룹별 공유 Promise가 요청을 하나로 합친다.
  await expect.poll(completeCalls).toBe(1)
  await shot(page, `${SHOTS}/payment-01-paid.png`)
})

test('[AC-PAYMENT-E2E-002] FAILED 뒤 다시 시도는 prepare→결제창→complete를 같은 수단으로 다시 돌린다', async ({
  page,
}) => {
  await stubSession(page)
  await stubPortOne(page)
  const prepareCalls = await stubPrepare(page)
  const completeCalls = await stubComplete(page, [
    { status: 200, json: failed('PG_DECLINED') },
    { status: 200, json: paid(64000) },
  ])

  await page.goto(RESULT_URL)

  await expect(page.getByText('결제에 실패했어요')).toBeVisible()
  await expect(page.getByText(/승인을 거절했어요/)).toBeVisible()
  await expect(page.getByRole('button', { name: '뒤로 가기' })).toBeVisible()
  await shot(page, `${SHOTS}/payment-02-failed.png`)

  await page.getByRole('button', { name: '다시 시도' }).click()

  await expect(page.getByText('결제가 완료되었어요')).toBeVisible()
  await expect.poll(prepareCalls).toBe(1)
  await expect.poll(completeCalls).toBe(2)
  const requests = await page.evaluate(
    () => (window as unknown as { __portoneRequests: unknown[] }).__portoneRequests,
  )
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    storeId: 'store-e2e',
    channelKey: 'channel-key-e2e',
    paymentId: OG,
    totalAmount: 64000,
    currency: 'CURRENCY_KRW',
    payMethod: 'EASY_PAY',
    easyPay: { easyPayProvider: 'KAKAOPAY' },
    redirectUrl: `${ORIGIN}/payment/result?orderGroupId=${OG}&method=kakaopay`,
  })
  await shot(page, `${SHOTS}/payment-03-retry-paid.png`)
})

test('[AC-PAYMENT-E2E-003] 결제창을 취소하면 실패 화면에 남아 안내하고 complete를 더 부르지 않는다', async ({
  page,
}) => {
  await stubSession(page)
  await stubPortOne(page, { code: 'FAILURE_TYPE_PG', message: '사용자가 결제를 취소하셨습니다' })
  await stubPrepare(page)
  const completeCalls = await stubComplete(page, [{ status: 200, json: failed(null) }])

  await page.goto(RESULT_URL)
  await expect(page.getByText('결제에 실패했어요')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도' }).click()

  await expect(page.getByText(/결제를 취소했어요/)).toBeVisible()
  await expect(page.getByText('결제에 실패했어요')).toBeVisible()
  expect(completeCalls()).toBe(1)
})

test('[AC-PAYMENT-E2E-004] 60010 대조 실패는 재시도 없이 고객센터 안내로 끝낸다', async ({
  page,
}) => {
  await stubSession(page)
  await stubPortOne(page)
  await stubComplete(page, [
    {
      status: 409,
      json: {
        errorCode: 60010,
        message: '결제 금액이 주문 금액과 일치하지 않습니다. 고객센터로 문의해 주세요.',
      },
    },
  ])

  await page.goto(RESULT_URL)

  await expect(page.getByText('확인이 필요한 결제예요')).toBeVisible()
  await expect(page.getByText(/고객센터로 문의해 주세요/)).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '고객센터 문의' })).toBeVisible()
  await shot(page, `${SHOTS}/payment-04-review-required.png`)
})

test('[AC-PAYMENT-E2E-005] 주문그룹 없이 진입하면 complete 없이 장바구니로 보낸다', async ({
  page,
}) => {
  await stubSession(page)
  await stubPortOne(page)
  await page.route('**/api/v1/carts', route => fulfill(route, 200, { data: { sellerGroups: [] } }))
  const completeCalls = await stubComplete(page, [{ status: 200, json: paid(64000) }])

  await page.goto('/payment/result')

  await expect(page).toHaveURL(`${ORIGIN}/cart`)
  expect(completeCalls()).toBe(0)
})

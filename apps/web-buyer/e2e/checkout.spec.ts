import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  CartEnvelope,
  CompletePaymentEnvelope,
  CreateOrderGroupEnvelope,
  CreateOrderGroupRequest,
  PreparePaymentEnvelope,
} from '@aechak/api'

// 주문서(b1-st-4) ↔ GET /carts + POST /order-groups(Idempotency-Key) + prepare → 포트원 SDK → /payment/result
// 연동 E2E. 실백엔드·실PG 없이 page.route 스텁으로 서버 계약을 재현하고(교차 출처 8080 + withCredentials라
// origin·Allow-Credentials·OPTIONS 방어), 포트원 SDK는 window.PortOne을 미리 심어 CDN 로드를 막는다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'
const OG = '01JCHKOUTE2E000000000000001'
const EXPIRES_AT = '2099-01-01T00:00:00+09:00'

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

// 리얼상점(임계 50,000·기본 3,000) 급식기 64,000 → 무료배송, 결제 64,000.
function cart(price = 64000): CartEnvelope {
  return {
    data: {
      sellerGroups: [
        {
          sellerId: 1,
          storeName: '리얼상점',
          baseShippingFee: 3000,
          freeShippingThreshold: 50000,
          items: [
            {
              cartItemId: 11,
              productId: '01J000000000000000000TEST',
              optionCombinationId: 1,
              productName: '리얼 프리미엄 자동 급식기',
              thumbnail: null,
              selectedOptions: '기본형',
              quantity: 1,
              originalPrice: 89000,
              price,
              discountRate: 28,
              remainingStock: 10,
              itemStatus: 'ACTIVE',
              isOrderable: true,
            },
          ],
        },
      ],
    },
  }
}

const created = (finalPaymentAmount: number): CreateOrderGroupEnvelope => ({
  data: {
    orderGroupId: OG,
    expiresAt: EXPIRES_AT,
    totalProductAmount: finalPaymentAmount,
    totalShippingFee: 0,
    usedPoint: 0,
    finalPaymentAmount,
  },
})
const prepared = (targetAmount: number): PreparePaymentEnvelope => ({
  data: { paymentId: OG, targetAmount, storeId: 'store-e2e', channelKey: 'channel-key-e2e' },
})
const paid = (finalPaymentAmount: number): CompletePaymentEnvelope => ({
  data: { status: 'PAID', orderGroupId: OG, finalPaymentAmount, usedPoint: 0, failureCode: null },
})

// 결제창 스텁 — 요청을 window.__portoneRequests에 쌓고 정상 종료 응답을 돌려준다.
async function stubPortOne(page: Page) {
  await page.route('https://cdn.portone.io/**', route => route.abort())
  await page.addInitScript(() => {
    const w = window as unknown as {
      __portoneRequests: unknown[]
      PortOne: { requestPayment: (req: { paymentId: string }) => Promise<unknown> }
    }
    w.__portoneRequests = []
    w.PortOne = {
      requestPayment: async req => {
        w.__portoneRequests.push(req)
        return { transactionType: 'PAYMENT', txId: 'tx-e2e', paymentId: req.paymentId }
      },
    }
  })
}

interface CreateRecord {
  key: string | null
  body: CreateOrderGroupRequest
}

// 주문서가 의존하는 조회 셋(세션 refresh·장바구니·배송지·적립금)을 한 번에 세운다.
async function stubCheckoutReads(page: Page, state: { cart: CartEnvelope }) {
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route('**/api/v1/carts', route => fulfill(route, 200, state.cart))
  await page.route('**/api/v1/delivery-addresses', route =>
    fulfill(route, 200, {
      data: {
        addresses: [
          {
            addressId: 7,
            label: '집',
            receiverName: '김집사',
            contactNumber: '01012345678',
            zipCode: '06236',
            baseAddress: '서울 강남구 테헤란로 1',
            detailAddress: '101동 1001호',
            isDefault: true,
          },
        ],
        totalCount: 1,
      },
    }),
  )
  await page.route('**/api/v1/users/me/points', route =>
    fulfill(route, 200, { data: { balance: 0 } }),
  )
}

// POST /order-groups — 헤더·본문을 기록하고 응답 순서를 소비한다(마지막 값 반복).
async function stubCreateOrderGroup(
  page: Page,
  sequence: Array<{ status: number; json: unknown }>,
) {
  const records: CreateRecord[] = []
  await page.route('**/api/v1/order-groups', route => {
    if (route.request().method() !== 'POST') return fulfill(route, 204)
    records.push({
      key: route.request().headers()['idempotency-key'] ?? null,
      body: route.request().postDataJSON() as CreateOrderGroupRequest,
    })
    const step = sequence[Math.min(records.length - 1, sequence.length - 1)]!
    return fulfill(route, step.status, step.json)
  })
  return records
}

async function stubPayment(page: Page, amount: number) {
  let prepares = 0
  let completes = 0
  await page.route(`**/api/v1/order-groups/${OG}/payment/prepare`, route => {
    if (route.request().method() !== 'POST') return fulfill(route, 204)
    prepares += 1
    return fulfill(route, 201, prepared(amount))
  })
  await page.route(`**/api/v1/order-groups/${OG}/payment/complete`, route => {
    if (route.request().method() !== 'POST') return fulfill(route, 204)
    completes += 1
    return fulfill(route, 200, paid(amount))
  })
  return { prepares: () => prepares, completes: () => completes }
}

test('[AC-CHECKOUT-E2E-001] 주문서는 서버 장바구니 선택 라인으로 금액을 계산하고, 결제하기는 멱등키 헤더·주문 본문 → 결제창 → 결과 화면으로 이어진다', async ({
  page,
}) => {
  await stubPortOne(page)
  await stubCheckoutReads(page, { cart: cart() })
  const records = await stubCreateOrderGroup(page, [{ status: 201, json: created(64000) }])
  const payment = await stubPayment(page, 64000)

  await page.goto('/checkout')

  await expect(page.getByText(/김집사/)).toBeVisible()
  await expect(page.getByText('주문 상품 / 리얼상점')).toBeVisible()
  await expect(page.getByText('무료')).toBeVisible()
  const payButton = page.getByRole('button', { name: '64,000원 결제하기' })
  await expect(payButton).toBeDisabled()
  await shot(page, `${SHOTS}/checkout-01-form.png`)

  // DS Checkbox의 input은 sr-only라 라벨을 누른다.
  await page.getByText('주문 내용을 확인했으며 결제에 동의해요').click()
  await expect(payButton).toBeEnabled()
  await payButton.click()

  await expect(page).toHaveURL(`${ORIGIN}/payment/result?orderGroupId=${OG}&method=kakaopay`)
  await expect(page.getByText('결제가 완료되었어요')).toBeVisible()
  await expect(page.getByText(OG)).toBeVisible()
  await shot(page, `${SHOTS}/checkout-02-paid.png`)

  // 주문 생성은 한 번, 헤더는 공백 아닌 1~100자, 본문은 선택 라인·배송지·적립금·표시 금액.
  expect(records).toHaveLength(1)
  expect(records[0]!.key).toBeTruthy()
  expect(records[0]!.key!.trim().length).toBeGreaterThan(0)
  expect(records[0]!.key!.length).toBeLessThanOrEqual(100)
  expect(records[0]!.body).toEqual({
    cartItemIds: [11],
    deliveryAddressId: 7,
    usedPoint: 0,
    expectedFinalAmount: 64000,
  })
  expect(payment.prepares()).toBe(1)
  await expect.poll(payment.completes).toBeGreaterThanOrEqual(1)
  const requests = await page.evaluate(
    () => (window as unknown as { __portoneRequests: unknown[] }).__portoneRequests,
  )
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    storeId: 'store-e2e',
    channelKey: 'channel-key-e2e',
    paymentId: OG,
    orderName: '리얼 프리미엄 자동 급식기',
    totalAmount: 64000,
    currency: 'CURRENCY_KRW',
    payMethod: 'EASY_PAY',
    easyPay: { easyPayProvider: 'KAKAOPAY' },
    redirectUrl: `${ORIGIN}/payment/result?orderGroupId=${OG}&method=kakaopay`,
  })

  // 결과 화면은 replace로 들어와 뒤로가기가 주문서를 재진입하지 않는다.
  await page.goBack()
  await expect(page).not.toHaveURL(/\/checkout/)
})

test('[AC-CHECKOUT-E2E-002] 50106(금액 불일치)이면 주문서에 남아 안내하고 장바구니를 다시 읽어 금액을 갱신한다', async ({
  page,
}) => {
  await stubPortOne(page)
  const state = { cart: cart() }
  await stubCheckoutReads(page, state)
  const records = await stubCreateOrderGroup(page, [
    {
      status: 409,
      json: {
        errorCode: 50106,
        message: '주문 금액이 변경되었습니다. 주문서를 다시 확인해 주세요.',
      },
    },
  ])

  await page.goto('/checkout')
  await expect(page.getByRole('button', { name: '64,000원 결제하기' })).toBeVisible()
  // 화면이 64,000원을 보여주는 사이 서버 가격이 60,000원으로 바뀐다.
  state.cart = cart(60000)

  await page.getByText('주문 내용을 확인했으며 결제에 동의해요').click()
  await page.getByRole('button', { name: '64,000원 결제하기' }).click()

  await expect(
    page.getByText('주문 금액이 바뀌어 다시 계산했어요. 금액을 확인하고 다시 결제해 주세요'),
  ).toBeVisible()
  await expect(page).toHaveURL(`${ORIGIN}/checkout`)
  await expect(page.getByRole('button', { name: '60,000원 결제하기' })).toBeVisible()
  expect(records).toHaveLength(1)
  const requests = await page.evaluate(
    () => (window as unknown as { __portoneRequests: unknown[] }).__portoneRequests,
  )
  expect(requests).toHaveLength(0)
  await shot(page, `${SHOTS}/checkout-03-amount-mismatch.png`)
})

test('[AC-CHECKOUT-E2E-003] 주문할 상품이 없으면 빈 안내를 보여주고 결제 버튼을 두지 않는다', async ({
  page,
}) => {
  await stubPortOne(page)
  await stubCheckoutReads(page, { cart: { data: { sellerGroups: [] } } })

  await page.goto('/checkout')

  await expect(page.getByText('주문할 상품이 없어요')).toBeVisible()
  await expect(page.getByRole('button', { name: /결제하기/ })).toHaveCount(0)
  await shot(page, `${SHOTS}/checkout-04-empty.png`)
})

test('[AC-CHECKOUT-E2E-004] 만료 전 주문그룹이 있으면 live 장바구니 대신 스냅샷 금액·수단으로 진행 중인 주문 모드가 되고, 이어서 결제하기는 새 주문 없이 결제창 → 결과 화면으로 간다', async ({
  page,
}) => {
  await stubPortOne(page)
  // 결제창 취소 뒤 떠난 세션 — 카드 61,000원(적립금 3,000 사용) 주문그룹이 결제를 기다린다. live 장바구니는 64,000원.
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key!, value!),
    [
      'aechak.orderAttempt',
      JSON.stringify({
        attemptId: 'attempt-e2e',
        idempotencyKey: 'key-e2e',
        fingerprint: '11|7|3000|61000',
        orderGroupId: OG,
        expiresAt: EXPIRES_AT,
        snapshot: {
          method: 'card',
          orderName: '리얼 프리미엄 자동 급식기',
          cartItemIds: [11],
          lineCount: 1,
          totalProductAmount: 64000,
          totalShippingFee: 0,
          usedPoint: 3000,
          finalPaymentAmount: 61000,
        },
        createdAt: '2026-10-18T00:00:00+09:00',
      }),
    ],
  )
  await stubCheckoutReads(page, { cart: cart() })
  const records = await stubCreateOrderGroup(page, [{ status: 201, json: created(64000) }])
  const payment = await stubPayment(page, 61000)

  await page.goto('/checkout')

  await expect(page.getByText('진행 중인 주문이 있어요')).toBeVisible()
  await expect(page.getByText('-3,000원')).toBeVisible()
  const cardRadio = page.getByRole('radio', { name: '신용 / 체크카드' })
  await expect(cardRadio).toBeChecked()
  await expect(cardRadio).toBeDisabled()
  await expect(page.getByText('진행 중인 주문은 처음 선택한 수단으로 결제돼요')).toBeVisible()
  await expect(page.getByRole('button', { name: '새 주문으로 시작' })).toBeVisible()
  await expect(page.getByRole('button', { name: '64,000원 결제하기' })).toHaveCount(0)
  await shot(page, `${SHOTS}/checkout-05-in-progress.png`)

  await page.getByRole('button', { name: '61,000원 이어서 결제하기' }).click()

  await expect(page).toHaveURL(`${ORIGIN}/payment/result?orderGroupId=${OG}&method=card`)
  await expect(page.getByText('결제가 완료되었어요')).toBeVisible()
  // 새 주문그룹은 만들지 않고, 결제창은 스냅샷 수단(카드)·금액으로 연다.
  expect(records).toHaveLength(0)
  expect(payment.prepares()).toBe(1)
  const requests = await page.evaluate(
    () => (window as unknown as { __portoneRequests: unknown[] }).__portoneRequests,
  )
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ paymentId: OG, totalAmount: 61000, payMethod: 'CARD' })
})

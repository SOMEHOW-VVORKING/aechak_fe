import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  ClaimItemResponse,
  ClaimReasonCatalogEnvelope,
  OrderDeliveryAddressResponse,
  OrderDetailEnvelope,
  OrderGroupDetailEnvelope,
} from '@aechak/api'

// 클레임(취소·반품·교환) 요청·내역·철회와 주문그룹 형제 주문 E2E.
// 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다(교차 출처 8080 + withCredentials라
// 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수).
// 사유 선택지(GET /claims/reasons)는 SCRUM-273(BE #150) 미머지로 dev에 없다 —
// 404로 떨어지는 경로도 한 케이스로 못박는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

const ADDRESS: OrderDeliveryAddressResponse = {
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '04044',
  baseAddress: '서울 마포구 양화로 00',
  detailAddress: '101동 1004호',
  deliveryMemo: null,
}

const ORDER_ID = '01K7E2E0CLAIMORDER0000001'
const SIBLING_ID = '01K7E2E0CLAIMSIBLING00001'
const GROUP_ID = '01K7E2E0CLAIMGROUP0000001'

const SNACK = {
  orderItemId: 9101,
  productId: '01K7E2E0PRODSNACK00000001',
  productName: '유기농 수제 간식',
  thumbnailUrl: null,
  optionName: '연어 / 200g',
  quantity: 2,
  unitPrice: 12000,
  itemStatus: 'ORDERED' as const,
}

const TOY = {
  orderItemId: 9102,
  productId: '01K7E2E0PRODTOY0000000001',
  productName: '삑삑 공',
  thumbnailUrl: null,
  optionName: '기본',
  quantity: 1,
  unitPrice: 8000,
  itemStatus: 'ORDERED' as const,
}

/** 출고 대기 — 서버가 취소만 받는 상태(be ClaimType.requestableFrom). */
const BEFORE_DISPATCH: OrderDetailEnvelope = {
  data: {
    orderId: ORDER_ID,
    orderGroupId: GROUP_ID,
    orderedAt: '2026-10-10T10:00:00+09:00',
    status: 'DISPATCH_PENDING',
    sellerName: '스마트펫',
    items: [SNACK, TOY],
    payment: {
      sellerShippingFee: 3000,
      totalProductAmount: 32000,
      totalShippingFee: 3000,
      couponDiscountAmount: 0,
      usedPoint: 0,
      finalPaymentAmount: 35000,
    },
    deliveryAddress: ADDRESS,
    shipment: null,
    activeClaim: null,
    purchaseConfirmDueAt: null,
  },
}

/** 같은 결제에 셀러 둘 — 형제 주문 카드가 뜨는 조건. */
const GROUP: OrderGroupDetailEnvelope = {
  data: {
    orderGroupId: GROUP_ID,
    status: 'PAID',
    totalProductAmount: 32000,
    totalShippingFee: 3000,
    usedPoint: 0,
    finalPaymentAmount: 35000,
    expiresAt: '2026-10-10T10:10:00+09:00',
    deliveryAddress: ADDRESS,
    orders: [
      {
        orderId: ORDER_ID,
        status: 'DISPATCH_PENDING',
        sellerName: '스마트펫',
        sellerShippingFee: 3000,
        items: [SNACK, TOY],
      },
      {
        orderId: SIBLING_ID,
        status: 'DELIVERED',
        sellerName: '멍멍마트',
        sellerShippingFee: 0,
        items: [{ ...SNACK, orderItemId: 9201, productName: '관절 영양제' }],
      },
    ],
  },
}

const REASONS: ClaimReasonCatalogEnvelope = {
  data: {
    claimTypes: [
      {
        claimType: 'CANCEL',
        reasons: [
          { code: 'CHANGE_OF_MIND', label: '단순 변심', detailRequired: false },
          { code: 'DELIVERY_DELAY', label: '배송이 너무 늦어요', detailRequired: false },
          { code: 'OTHER', label: '기타', detailRequired: true },
        ],
      },
      {
        claimType: 'RETURN',
        reasons: [{ code: 'DEFECTIVE', label: '상품이 파손되었거나 불량이에요', detailRequired: false }],
      },
      {
        claimType: 'EXCHANGE',
        reasons: [{ code: 'DEFECTIVE', label: '상품이 파손되었거나 불량이에요', detailRequired: false }],
      },
    ],
  },
}

interface ClaimStubs {
  /** 내역 응답. 테스트가 배열을 직접 고쳐 요청·철회 뒤 재조회 결과를 바꾼다. */
  claims: ClaimItemResponse[]
  /** 상세 응답. 진행 중 클레임을 켜고 끄려면 이 객체를 고친다. */
  detail: OrderDetailEnvelope
  /** 받은 요청 본문들 — 화면이 보낸 payload를 검증한다. */
  posted: unknown[]
}

async function stubClaimScreens(
  page: Page,
  options: { reasons?: 'ok' | 'missing' } = {},
): Promise<ClaimStubs> {
  const stubs: ClaimStubs = {
    claims: [],
    detail: { data: { ...BEFORE_DISPATCH.data, items: [SNACK, TOY] } },
    posted: [],
  }
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
  await page.route(`${API}/claims/reasons`, route =>
    options.reasons === 'missing'
      ? fulfill(route, 404, { errorCode: 90000, message: 'Not Found' })
      : fulfill(route, 200, REASONS),
  )
  await page.route(`${API}/order-groups/*`, route => fulfill(route, 200, GROUP))
  // 철회는 DELETE /orders/{id}/claims/{claimPublicId} — 더 좁은 글롭을 먼저 등록하면
  // 나중에 등록한 넓은 글롭이 가로채므로 좁은 쪽을 **뒤에** 등록한다(Playwright는 최신 라우트가 이긴다).
  await page.route(`${API}/orders/*/claims`, async route => {
    if (route.request().method() === 'POST') {
      stubs.posted.push(route.request().postDataJSON())
      return fulfill(route, 201, {
        data: {
          claimPublicId: 'CLAIM-NEW',
          claimType: 'CANCEL',
          status: 'CLAIM_REQUESTED',
          refundAmount: 35000,
          sellerApprovalStatus: 'REQUESTED',
          autoApproveDueAt: '2026-10-22T10:00:00',
          requestedAt: '2026-10-20T10:00:00',
        },
      })
    }
    return fulfill(route, 200, { data: { items: stubs.claims } })
  })
  await page.route(`${API}/orders/*/claims/*`, route => {
    const claim = stubs.claims.find(c => c.status === 'CLAIM_REQUESTED')
    if (claim) {
      claim.status = 'WITHDRAWN'
      claim.resolvedAt = '2026-10-21T10:00:00'
    }
    delete (stubs.detail.data as { activeClaim?: unknown }).activeClaim
    stubs.detail.data.activeClaim = null
    return fulfill(route, 204)
  })
  await page.route(`${API}/orders/*`, route => fulfill(route, 200, stubs.detail))
  return stubs
}

test('[AC-CLAIM-E2E-001] 발송 전 상세에서 취소를 신청하면 서버가 확정한 환불액을 보여준다', async ({
  page,
}) => {
  const stubs = await stubClaimScreens(page)
  await page.goto(`/orders/${ORDER_ID}`)

  await expect(page.getByRole('button', { name: '주문 취소' })).toBeVisible()
  await expect(page.getByRole('button', { name: '반품 신청' })).toHaveCount(0)
  await shot(page, `${SHOTS}/claims-01-detail-cancelable.png`)

  await page.getByRole('button', { name: '주문 취소' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/orders/${ORDER_ID}/claim?type=cancel`)

  // 선택지는 서버가 준 문구 그대로다.
  await expect(page.getByText('단순 변심')).toBeVisible()
  await expect(page.getByText('배송이 너무 늦어요')).toBeVisible()
  await shot(page, `${SHOTS}/claims-02-request-form.png`)

  await page.getByText('단순 변심').click()
  await page.getByRole('button', { name: '주문 취소하기' }).click()
  await expect(page.getByText('주문을 취소할까요?')).toBeVisible()
  await shot(page, `${SHOTS}/claims-03-request-confirm.png`)

  await page.getByRole('button', { name: '취소 신청할게요' }).click()
  await expect(page.getByText('취소를 접수했어요')).toBeVisible()
  await expect(page.getByText('35,000원')).toBeVisible()
  await shot(page, `${SHOTS}/claims-04-request-done.png`)

  // 수량을 쪼갠 요청은 서버가 422 50410으로 거절하므로 늘 주문 수량 그대로 보낸다.
  expect(stubs.posted).toEqual([
    {
      claimType: 'CANCEL',
      reasonCode: 'CHANGE_OF_MIND',
      items: [
        { orderItemId: 9101, quantity: 2 },
        { orderItemId: 9102, quantity: 1 },
      ],
    },
  ])
})

test('[AC-CLAIM-E2E-002] 사유 경로가 아직 없으면(404) 화면이 죽지 않고 접수를 잠근다', async ({
  page,
}) => {
  // SCRUM-273(BE #150) 머지 전 dev 상태. 선택지를 하드코딩해 되살리지 않는다.
  await stubClaimScreens(page, { reasons: 'missing' })
  await page.goto(`/orders/${ORDER_ID}/claim?type=cancel`)

  await expect(page.getByText('아직 요청 사유를 받을 준비가 안 됐어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '주문 취소하기' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
  await expect(page.getByText('단순 변심')).toHaveCount(0)
  // 상세는 멀쩡하다 — 사유 경로 하나가 없다고 주문 화면이 막히지 않는다.
  await page.goto(`/orders/${ORDER_ID}`)
  await expect(page.getByText('주문번호')).toBeVisible()
  await shot(page, `${SHOTS}/claims-05-reasons-missing.png`)
})

test('[AC-CLAIM-E2E-003] 진행 중 요청은 내역에 뜨고 철회하면 품목이 풀린다', async ({ page }) => {
  const stubs = await stubClaimScreens(page)
  stubs.detail.data.activeClaim = {
    claimPublicId: 'CLAIM-ACTIVE',
    claimType: 'CANCEL',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
  }
  stubs.claims.push({
    claimPublicId: 'CLAIM-ACTIVE',
    claimType: 'CANCEL',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REQUESTED',
    returnCostBearer: null,
    refundAmount: 35000,
    rejectionReason: null,
    requestedAt: '2026-10-20T10:00:00',
    approvedAt: null,
    resolvedAt: null,
    items: [{ orderItemId: 9101, productName: '유기농 수제 간식', quantity: 2, refundAmount: 24000 }],
  })
  await page.goto(`/orders/${ORDER_ID}`)

  await expect(page.getByText('취소/반품/교환 요청')).toBeVisible()
  await expect(page.getByText('판매자 확인 대기')).toBeVisible()
  await expect(page.getByText('유기농 수제 간식 (2개)')).toBeVisible()
  // 진행 중에는 새 요청을 받지 않는다(서버 409 50403).
  await expect(page.getByRole('button', { name: '주문 취소' })).toHaveCount(0)
  await shot(page, `${SHOTS}/claims-06-history-in-progress.png`)

  await page.getByRole('button', { name: '요청 철회' }).click()
  await expect(page.getByText('취소 요청을 철회할까요?')).toBeVisible()
  await page.getByRole('button', { name: '철회할게요' }).click()

  await expect(page.getByText('취소 요청을 철회했어요')).toBeVisible()
  // 상태 pill만 집는다 — 토스트 문구에도 '철회'가 들어 있어 부분 일치는 둘을 함께 집는다.
  await expect(page.getByText('철회', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '요청 철회' })).toHaveCount(0)
  // 품목이 풀려 다시 신청할 수 있다.
  await expect(page.getByRole('button', { name: '주문 취소' })).toBeVisible()
  await shot(page, `${SHOTS}/claims-07-history-withdrawn.png`)
})

test('[AC-CLAIM-E2E-004] 같은 결제의 다른 주문을 상세에서 바로 열 수 있다', async ({ page }) => {
  await stubClaimScreens(page)
  await page.goto(`/orders/${ORDER_ID}`)

  await expect(page.getByText('같은 결제의 다른 주문')).toBeVisible()
  await expect(page.getByText('멍멍마트')).toBeVisible()
  // 자기 자신은 목록에 없다(상세 헤더의 셀러명만 남는다).
  await expect(page.getByText('주문 상품 / 스마트펫')).toBeVisible()
  await shot(page, `${SHOTS}/claims-08-group-siblings.png`)

  await page.getByText('멍멍마트').click()
  await expect(page).toHaveURL(`${ORIGIN}/orders/${SIBLING_ID}`)
})

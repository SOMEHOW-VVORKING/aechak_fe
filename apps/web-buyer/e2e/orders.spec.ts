import { test, expect, type Page, type Route } from '@playwright/test'
import { stubMemberSession } from './session'
import type {
  OrderDeliveryAddressResponse,
  OrderDetailEnvelope,
  OrderGroupItemResponse,
  OrderListEnvelope,
} from '@aechak/api'

// 주문 목록(b4-st-1) ↔ GET /order-groups, 주문 상세(b1-st-6) ↔ GET /orders/{orderId} 연동 E2E.
// 실백엔드 없이 page.route 스텁으로 서버 계약(status 필터·커서·그룹 안 셀러 주문별 상태)을 재현한다
// (교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수).
// page.screenshot으로 PR 첨부용 캡처를 test-results/pr-c(gitignore)에 남긴다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'
// 캡처에서 서버 썸네일이 실제로 그려졌는지 보이도록 단색 이미지를 쓴다.
const IMG =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect width=%2260%22 height=%2260%22 fill=%22%23E8B04B%22/%3E%3C/svg%3E'

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
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
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

// 새 페이지 로드는 메모리 access가 없어 세션 복원이 refresh를 부를 수 있다 — 회원 시나리오로 고정한다.
async function stubSession(page: Page) {
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )
}

// 생성 타입을 쓴다 — e2e는 tsc include 밖이라 로컬 인터페이스면 서버 계약 변경을 못 잡는다.
// 한 결제(그룹) 안에 배송중·배송완료 셀러 주문이 섞인 혼합 상태 그룹 + 출고 대기 그룹 + 취소 그룹.
const MIXED: OrderGroupItemResponse = {
  orderGroupId: '01K7E2E0MIXED000000000001',
  orderedAt: '2026-10-10T10:00:00+09:00',
  totalProductAmount: 84000,
  totalShippingFee: 3000,
  couponDiscountAmount: 0,
  usedPoint: 1000,
  finalPaymentAmount: 86000,
  sellerOrders: [
    {
      orderId: '01K7E2E0ORDERSHIP00000001',
      sellerName: '냥이상점',
      status: 'SHIPPING',
      itemCount: 2,
      representativeItem: {
        orderItemId: 9001,
        productId: '01K7E2E0PRODCHURU00000001',
        productName: '츄르 참치맛 40개입',
        thumbnailUrl: IMG,
        optionName: '참치맛 / 40개입',
        quantity: 3,
        unitPrice: 13900,
        itemStatus: 'ORDERED',
      },
    },
    {
      orderId: '01K7E2E0ORDERDONE00000001',
      sellerName: '멍멍마트',
      status: 'DELIVERED',
      itemCount: 1,
      representativeItem: {
        orderItemId: 9002,
        productId: '01K7E2E0PRODLEASH00000001',
        productName: '자동 리드줄 5m 대형견용',
        thumbnailUrl: null,
        optionName: '5m / 블랙',
        quantity: 1,
        unitPrice: 24000,
        itemStatus: 'ORDERED',
      },
    },
  ],
}

const DISPATCH_PENDING: OrderGroupItemResponse = {
  orderGroupId: '01K7E2E0PENDING0000000001',
  orderedAt: '2026-10-08T09:12:00+09:00',
  totalProductAmount: 32000,
  totalShippingFee: 3000,
  couponDiscountAmount: 0,
  usedPoint: 0,
  finalPaymentAmount: 35000,
  sellerOrders: [
    {
      orderId: '01K7E2E0ORDERPREP00000001',
      sellerName: '스마트펫',
      status: 'DISPATCH_PENDING',
      itemCount: 1,
      representativeItem: {
        orderItemId: 9003,
        productId: '01K7E2E0PRODSAND00000001',
        productName: '대용량 모래 8.5L 벤토나이트',
        thumbnailUrl: null,
        optionName: '무향 / 8.5L',
        quantity: 2,
        unitPrice: 16000,
        itemStatus: 'ORDERED',
      },
    },
  ],
}

const CANCELLED: OrderGroupItemResponse = {
  orderGroupId: '01K7E2E0CANCEL00000000001',
  orderedAt: '2026-10-02T15:44:00+09:00',
  totalProductAmount: 29000,
  totalShippingFee: 3000,
  couponDiscountAmount: 0,
  usedPoint: 0,
  finalPaymentAmount: 32000,
  sellerOrders: [
    {
      orderId: '01K7E2E0ORDERCANC00000001',
      sellerName: null,
      status: 'CANCELLED',
      itemCount: 1,
      representativeItem: {
        orderItemId: 9004,
        productId: '01K7E2E0PRODSCRAT00000001',
        productName: '스크래쳐 하우스 2종 세트',
        thumbnailUrl: null,
        optionName: '2종 세트',
        quantity: 1,
        unitPrice: 29000,
        itemStatus: 'ORDERED',
      },
    },
  ],
}

// 주문 시점 배송지 스냅샷(BE OrderDeliveryAddressResponse — 연락처는 숫자만).
const ADDRESS: OrderDeliveryAddressResponse = {
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '04044',
  baseAddress: '서울 마포구 양화로 00',
  detailAddress: '101동 1004호',
  deliveryMemo: '문 앞에 놓아주세요',
}

// BE OrderStatusFilter — 하위 주문 하나라도 해당하면 그룹이 통째로 걸린다.
const FILTER: Record<string, string[]> = {
  all: [
    'PAID',
    'PREPARING',
    'DISPATCH_PENDING',
    'SHIPPING',
    'DELIVERED',
    'PURCHASE_CONFIRMED',
    'CANCELLED',
  ],
  ongoing: ['PAID', 'PREPARING', 'DISPATCH_PENDING', 'SHIPPING'],
  completed: ['DELIVERED', 'PURCHASE_CONFIRMED'],
  cancelled: ['CANCELLED'],
}

function listBody(url: URL, groups: OrderGroupItemResponse[], pageSize: number): OrderListEnvelope {
  const status = url.searchParams.get('status') ?? 'all'
  const cursor = url.searchParams.get('cursor')
  const allowed = FILTER[status] ?? FILTER['all']!
  const list = groups.filter(g => g.sellerOrders.some(so => allowed.includes(so.status)))
  const start = cursor ? Number(cursor) : 0
  const page = list.slice(start, start + pageSize)
  const next = start + pageSize
  const hasNext = next < list.length
  return {
    data: {
      orderGroups: page,
      totalCount: cursor == null ? list.length : null,
      nextCursor: hasNext ? String(next) : null,
      hasNext,
    },
  }
}

async function stubOrders(page: Page, groups: OrderGroupItemResponse[], pageSize = 20) {
  await stubSession(page)
  const calls: string[] = []
  await page.route(`${API}/order-groups?*`, route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'GET') calls.push(url.searchParams.get('status') ?? 'all')
    return fulfill(route, 200, listBody(url, groups, pageSize))
  })
  // 주문 상세가 함께 부르는 보조 경로 — 비워 둬야 스텁 밖으로 새어 나가지 않는다.
  // 글롭의 `*`는 `/`를 넘지 않으므로 목록(`/order-groups?*`)·결제(`/payment/*`)와 겹치지 않는다.
  await page.route(`${API}/orders/*/claims`, route => fulfill(route, 200, { data: { items: [] } }))
  await page.route(`${API}/order-groups/*`, route =>
    fulfill(route, 404, { errorCode: 50109, message: '주문 정보를 찾을 수 없습니다.' }),
  )
  return calls
}

const DETAIL: OrderDetailEnvelope = {
  data: {
    orderId: '01K7E2E0ORDERSHIP00000001',
    orderGroupId: MIXED.orderGroupId,
    orderedAt: MIXED.orderedAt,
    status: 'SHIPPING',
    sellerName: '냥이상점',
    items: [
      {
        orderItemId: 9001,
        productId: '01K7E2E0PRODCHURU00000001',
        productName: '츄르 참치맛 40개입',
        thumbnailUrl: IMG,
        optionName: '참치맛 / 40개입',
        quantity: 3,
        unitPrice: 13900,
        itemStatus: 'ORDERED',
      },
      {
        orderItemId: 9005,
        productId: '01K7E2E0PRODCUSHION000001',
        productName: '캣닢 쿠션',
        thumbnailUrl: null,
        optionName: '기본',
        quantity: 1,
        unitPrice: 9000,
        itemStatus: 'CANCELLED',
      },
    ],
    payment: {
      sellerShippingFee: 3000,
      totalProductAmount: 84000,
      totalShippingFee: 3000,
      couponDiscountAmount: 0,
      usedPoint: 1000,
      finalPaymentAmount: 86000,
    },
    deliveryAddress: ADDRESS,
    // 배송중이지만 송장이 아직 등록되지 않은 상태(BE는 송장 등록 전 null을 준다).
    shipment: null,
    activeClaim: null,
    purchaseConfirmDueAt: null,
  },
}

// 배송완료 + 송장 등록 + 자동확정 기한 — 구매확정 버튼이 뜨는 유일한 조건.
const DELIVERED_DETAIL: OrderDetailEnvelope = {
  data: {
    orderId: '01K7E2E0ORDERDONE00000001',
    orderGroupId: MIXED.orderGroupId,
    orderedAt: MIXED.orderedAt,
    status: 'DELIVERED',
    sellerName: '멍멍마트',
    items: [MIXED.sellerOrders[1]!.representativeItem!],
    payment: {
      sellerShippingFee: 0,
      totalProductAmount: 84000,
      totalShippingFee: 3000,
      couponDiscountAmount: 0,
      usedPoint: 1000,
      finalPaymentAmount: 86000,
    },
    deliveryAddress: ADDRESS,
    shipment: {
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: '1234567890',
      dispatchedAt: '2026-10-11T09:00:00+09:00',
      deliveredAt: '2026-10-12T14:00:00+09:00',
      lastTrackingStatus: null,
    },
    activeClaim: null,
    purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
  },
}

// 구매확정 — 품목별 리뷰 작성 진입이 열리는 상태.
const CONFIRMED_DETAIL: OrderDetailEnvelope = {
  data: {
    ...DELIVERED_DETAIL.data,
    status: 'PURCHASE_CONFIRMED',
    purchaseConfirmDueAt: null,
  },
}

// 회원 세션 전제 — 첫 진입 세션 확인(refresh)을 스텁하지 않으면 로그인 상태로 조건 건 조회가 안 나간다.
test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
})

test('[AC-ORDER-E2E-001] 주문 목록은 그룹 카드 안에 셀러 주문별 상태 pill을 그리고 세그먼트가 status 필터로 나간다', async ({
  page,
}) => {
  const calls = await stubOrders(page, [MIXED, DISPATCH_PENDING, CANCELLED])
  await page.goto('/orders')

  await expect(page.getByText('총 3건')).toBeVisible()
  await expect(page.getByText('츄르 참치맛 40개입 외 1개')).toBeVisible()
  // 혼합 그룹: 배송중 + 배송완료가 한 카드에, 출고 대기는 상품준비중으로.
  await expect(page.getByText('배송중')).toBeVisible()
  await expect(page.getByText('배송완료')).toBeVisible()
  await expect(page.getByText('상품준비중')).toBeVisible()
  await expect(page.getByText('취소완료')).toBeVisible()
  await expect(page.getByText('판매자 정보 없음')).toBeVisible()
  await expect(page.getByRole('button', { name: '리뷰 쓰기' })).toHaveCount(0)
  await shot(page, `${SHOTS}/orders-01-list-mixed.png`)

  await page.getByRole('tab', { name: '완료' }).click()
  await expect(page.getByText('총 1건')).toBeVisible()
  await expect(page.getByText('대용량 모래 8.5L 벤토나이트')).toHaveCount(0)
  // 그룹이 통째로 오므로 배송중 셀러 주문도 완료 탭 카드에 남는다.
  await expect(page.getByText('배송중')).toBeVisible()
  await expect.poll(() => calls).toEqual(['all', 'completed'])
  await shot(page, `${SHOTS}/orders-02-list-completed.png`)
})

test('[AC-ORDER-E2E-002] 더보기로 다음 커서 페이지를 이어 붙인다', async ({ page }) => {
  const groups = Array.from({ length: 11 }, (_, i): OrderGroupItemResponse => ({
    ...DISPATCH_PENDING,
    orderGroupId: `01K7E2E0PAGE0000000000${String(i).padStart(3, '0')}`,
    sellerOrders: [
      {
        ...DISPATCH_PENDING.sellerOrders[0]!,
        orderId: `01K7E2E0PAGEORDER000000${String(i).padStart(3, '0')}`,
        representativeItem: {
          ...DISPATCH_PENDING.sellerOrders[0]!.representativeItem!,
          productName: `페이지 상품 ${i}`,
        },
      },
    ],
  }))
  await stubOrders(page, groups, 10)
  await page.goto('/orders')

  await expect(page.getByText('페이지 상품 0')).toBeVisible()
  await expect(page.getByText('페이지 상품 10')).toHaveCount(0)
  await page.getByRole('button', { name: '더보기' }).click()
  await expect(page.getByText('페이지 상품 10')).toBeVisible()
  await expect(page.getByRole('button', { name: '더보기' })).toHaveCount(0)
})

test('[AC-ORDER-E2E-003] 셀러 주문 행을 누르면 상세로 가고 셀러 배송비와 주문 전체 금액을 구분해 보여준다', async ({
  page,
}) => {
  await stubOrders(page, [MIXED])
  await page.route(`${API}/orders/${DETAIL.data.orderId}`, route => fulfill(route, 200, DETAIL))
  await page.goto('/orders')

  await page.getByRole('button', { name: '츄르 참치맛 40개입 외 1개 주문 상세 보기' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/orders/${DETAIL.data.orderId}`)
  await expect(page.getByText('주문 상품 / 냥이상점')).toBeVisible()
  await expect(page.getByText('참치맛 / 40개입 / 3개')).toBeVisible()
  await expect(page.getByText('기본 / 1개 / 취소')).toBeVisible()
  await expect(page.getByText('이 주문의 배송비')).toBeVisible()
  await expect(page.getByText('결제 금액(주문 전체)')).toBeVisible()
  await expect(page.getByText('86,000원')).toBeVisible()
  // 배송지 스냅샷은 응답에 있으므로 그린다(연락처는 숫자열을 하이픈으로 조립).
  await expect(page.getByText('김집사 / 010-1234-5678')).toBeVisible()
  await expect(page.getByText('(04044) 서울 마포구 양화로 00 101동 1004호')).toBeVisible()
  // 송장 미등록이면 가짜 운송장을 만들지 않고 안내만 한다.
  await expect(page.getByText(/송장이 등록되면/)).toBeVisible()
  // 배송중에는 취소·구매확정·리뷰 진입이 없다.
  await expect(page.getByText(/자동으로 구매확정/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '주문 취소' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '구매확정' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '리뷰 쓰기' })).toHaveCount(0)
  await shot(page, `${SHOTS}/orders-03-detail.png`)
})

test('[AC-ORDER-E2E-006] 배송완료 상세는 송장·자동확정 기한을 보여주고 확인 Modal을 거쳐 구매확정한다', async ({
  page,
}) => {
  await stubOrders(page, [MIXED])
  let confirmed = false
  const confirmCalls: string[] = []
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}/confirm`, route => {
    if (route.request().method() === 'POST') {
      confirmCalls.push(route.request().url())
      confirmed = true
    }
    return fulfill(route, 204)
  })
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}`, route =>
    fulfill(route, 200, confirmed ? CONFIRMED_DETAIL : DELIVERED_DETAIL),
  )
  await page.goto(`/orders/${DELIVERED_DETAIL.data.orderId}`)

  await expect(page.getByText('배송 조회')).toBeVisible()
  await expect(page.getByText('CJ대한통운')).toBeVisible()
  await expect(page.getByText('1234567890')).toBeVisible()
  await expect(page.getByText(/자동으로 구매확정/)).toBeVisible()
  await shot(page, `${SHOTS}/orders-07-detail-delivered.png`)

  // 비가역 액션이라 바로 보내지 않고 확인 Modal을 먼저 띄운다.
  await page.getByRole('button', { name: '구매확정' }).click()
  await expect(page.getByText('구매확정할까요?')).toBeVisible()
  await expect(page.getByText(/되돌릴 수 없어요/)).toBeVisible()
  expect(confirmCalls).toHaveLength(0)
  await shot(page, `${SHOTS}/orders-08-confirm-modal.png`)

  await page.getByRole('button', { name: '확정할게요' }).click()
  await expect(page.getByText('구매확정했어요. 적립금이 지급돼요')).toBeVisible()
  await expect.poll(() => confirmCalls.length).toBe(1)
  // 확정 뒤에는 버튼이 사라지고 품목별 리뷰 진입이 열린다 — 리뷰 라인이 여기서 이어진다.
  await expect(page.getByRole('button', { name: '구매확정' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '리뷰 쓰기' })).toBeVisible()
  await shot(page, `${SHOTS}/orders-09-confirmed.png`)

  await page.getByRole('button', { name: '리뷰 쓰기' }).click()
  await expect(page).toHaveURL(
    new RegExp(`/reviews/write\\?.*orderItemId=${DELIVERED_DETAIL.data.items[0]!.orderItemId}`),
  )
})

test('[AC-ORDER-E2E-008] 확정 뒤 상세 재조회가 실패해도 확정 성공 토스트는 남는다', async ({ page }) => {
  await stubOrders(page, [MIXED])
  let detailCalls = 0
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}/confirm`, route =>
    fulfill(route, 204),
  )
  // 확정 자체는 성공하지만 무효화로 생긴 재조회가 500 — 비가역 처리를 조용히 삼키면 안 된다.
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}`, route => {
    if (route.request().method() === 'GET') detailCalls += 1
    return detailCalls <= 1
      ? fulfill(route, 200, DELIVERED_DETAIL)
      : fulfill(route, 500, { errorCode: 90000, message: 'server error' })
  })
  await page.goto(`/orders/${DELIVERED_DETAIL.data.orderId}`)

  await page.getByRole('button', { name: '구매확정' }).click()
  await page.getByRole('button', { name: '확정할게요' }).click()

  await expect(page.getByText('주문을 불러오지 못했어요', { exact: true })).toBeVisible()
  await expect(page.getByText('구매확정했어요. 적립금이 지급돼요')).toBeVisible()
  await shot(page, `${SHOTS}/orders-11-confirm-refetch-failed.png`)
})

test('[AC-ORDER-E2E-007] 구매확정 거절은 이미 확정(50008)과 확정 불가(50007)를 다르게 안내한다', async ({
  page,
}) => {
  await stubOrders(page, [MIXED])
  let errorCode = 50008
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}/confirm`, route =>
    fulfill(route, 409, { errorCode, message: 'conflict' }),
  )
  await page.route(`${API}/orders/${DELIVERED_DETAIL.data.orderId}`, route =>
    fulfill(route, 200, DELIVERED_DETAIL),
  )
  await page.goto(`/orders/${DELIVERED_DETAIL.data.orderId}`)

  await page.getByRole('button', { name: '구매확정' }).click()
  await page.getByRole('button', { name: '확정할게요' }).click()
  await expect(page.getByText('이미 구매확정된 주문이에요')).toBeVisible()

  errorCode = 50007
  await page.getByRole('button', { name: '구매확정' }).click()
  await page.getByRole('button', { name: '확정할게요' }).click()
  await expect(page.getByText('구매확정할 수 없는 상태로 바뀌었어요')).toBeVisible()
  await shot(page, `${SHOTS}/orders-10-confirm-rejected.png`)
})

test('[AC-ORDER-E2E-004] 없는 주문(404/50000)은 "찾을 수 없어요", 예전 취소 URL은 클레임 요청으로 넘어간다', async ({
  page,
}) => {
  await stubOrders(page, [MIXED])
  await page.route(`${API}/orders/*`, route =>
    fulfill(route, 404, { errorCode: 50000, message: '주문을 찾을 수 없습니다.' }),
  )
  // 예전 취소 URL은 취소 유형 클레임 요청으로 넘어가고, 주문이 없으면 그 화면이 404를 알린다.
  await page.goto('/orders/01K7E2E0UNKNOWN0000000001/cancel')

  await expect(page).toHaveURL(`${ORIGIN}/orders/01K7E2E0UNKNOWN0000000001/claim?type=cancel`)
  await expect(page.getByText('주문을 찾을 수 없어요')).toBeVisible()
  await expect(page.getByText('취소 사유')).toHaveCount(0)
  await shot(page, `${SHOTS}/orders-04-detail-not-found.png`)
})

test('[AC-ORDER-E2E-005] 빈 목록은 빈 상태, 서버 오류(500)는 다시 시도가 있는 오류 안내로 구분된다', async ({
  page,
}) => {
  await stubSession(page)
  let status = 500
  await page.route(`${API}/order-groups?*`, route =>
    status === 500
      ? fulfill(route, 500, { errorCode: 90000, message: 'server error' })
      : fulfill(route, 200, {
          data: { orderGroups: [], totalCount: 0, nextCursor: null, hasNext: false },
        }),
  )
  await page.goto('/orders')

  // 설명 문구에도 같은 구절이 들어 있어 제목만 정확 일치로 잡는다.
  await expect(page.getByText('주문 내역을 불러오지 못했어요', { exact: true })).toBeVisible()
  await expect(page.getByText('아직 주문 내역이 없어요')).toHaveCount(0)
  await shot(page, `${SHOTS}/orders-05-list-error.png`)

  status = 200
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('아직 주문 내역이 없어요')).toBeVisible()
  await shot(page, `${SHOTS}/orders-06-list-empty.png`)
})

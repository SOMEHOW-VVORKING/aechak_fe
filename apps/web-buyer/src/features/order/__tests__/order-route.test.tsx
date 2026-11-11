import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'
import {
  ORDER_CONFIRM_URL,
  ORDER_DETAIL_URL,
  ORDER_GROUPS_URL,
  makeOrderGroupRow,
  makeOrderLineRow,
  makeSellerOrderRow,
  seedOrderGroups,
  server,
} from '@/testing/msw/server'

// 주문 내역은 회원 전용 화면이라 비회원에게는 로그인 안내가 뜬다 — 토큰이 세션의 정본이므로
// 이 화면들의 전제인 회원 세션을 토큰으로 세운다.
beforeEach(() => setAccessToken('member-token'))

// 주문 목록·상세는 서버(GET /order-groups, GET /orders/{orderId})로 구동한다. 응답 계약·필터·커서는
// testing/msw/server.ts가 소유하고 여기선 seedOrderGroups로 시나리오만 세운다(afterEach가 리셋).

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 상세 어댑터가 retry만 덮어쓰므로 retryDelay 0으로 1회 재시도를 실시간 대기 없이 돌린다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 한 결제(그룹) 안에 배송중 셀러 주문과 배송완료 셀러 주문이 섞인 혼합 상태 그룹.
const MIXED = makeOrderGroupRow({
  orderGroupId: '01GRPMIXED0000000000000001',
  totalProductAmount: 84000,
  totalShippingFee: 3000,
  usedPoint: 1000,
  finalPaymentAmount: 86000,
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-mixed-ship',
      sellerName: '냥이상점',
      status: 'SHIPPING',
      sellerShippingFee: 3000,
      items: [
        makeOrderLineRow({
          productName: '츄르 참치맛 40개입',
          optionName: '참치맛 / 40개입',
          quantity: 3,
          unitPrice: 13900,
        }),
        makeOrderLineRow({
          productName: '캣닢 쿠션',
          optionName: '기본',
          quantity: 1,
          unitPrice: 9000,
          itemStatus: 'CANCELLED',
        }),
      ],
    }),
    makeSellerOrderRow({
      orderId: 'o-mixed-done',
      sellerName: '멍멍마트',
      status: 'DELIVERED',
      items: [
        makeOrderLineRow({
          productName: '자동 리드줄 5m 대형견용',
          optionName: '5m / 블랙',
          unitPrice: 24000,
        }),
      ],
    }),
  ],
})

const PAID_ONLY = makeOrderGroupRow({
  orderGroupId: '01GRPPAID00000000000000001',
  orderedAt: '2026-10-08T09:12:00+09:00',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-paid',
      sellerName: '스마트펫',
      status: 'DISPATCH_PENDING',
      items: [
        makeOrderLineRow({
          productName: '대용량 모래 8.5L 벤토나이트',
          optionName: '무향 / 8.5L',
          quantity: 2,
          unitPrice: 16000,
        }),
      ],
    }),
  ],
})

// 배송완료 + 송장 등록 + 자동확정 기한 — 구매확정 버튼이 뜨는 유일한 조건.
const DELIVERED = makeOrderGroupRow({
  orderGroupId: '01GRPDELIVERED00000000001',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-delivered',
      sellerName: '멍멍마트',
      status: 'DELIVERED',
      items: [makeOrderLineRow({ productName: '유기농 수제 간식', optionName: '연어 / 200g' })],
      shipment: {
        courierCode: 'CJ',
        courierName: 'CJ대한통운',
        trackingNumber: '1234567890',
        dispatchedAt: '2026-10-11T09:00:00+09:00',
        deliveredAt: '2026-10-12T14:00:00+09:00',
        lastTrackingStatus: null,
      },
      purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
    }),
  ],
})

// 배송완료인데 반품이 회수 단계 — 서버가 구매확정을 409 50007로 막는 상태.
const CLAIM_IN_PROGRESS = makeOrderGroupRow({
  orderGroupId: '01GRPCLAIM0000000000000001',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-claim',
      sellerName: '멍멍마트',
      status: 'DELIVERED',
      items: [makeOrderLineRow({ productName: '반품 중인 간식', itemStatus: 'RETURN_REQUESTED' })],
      purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
      activeClaim: {
        claimPublicId: '01CLAIM0000000000000000001',
        claimType: 'RETURN',
        status: 'COLLECTING',
        refundStatus: 'REQUESTED',
      },
    }),
  ],
})

const CONFIRMED_ITEM = makeOrderLineRow({
  orderItemId: 9001,
  productId: 'p-confirmed',
  productName: '유기농 수제 간식',
  optionName: '연어 / 200g',
})

// 구매확정 — 리뷰 작성 진입이 열리는 상태.
const CONFIRMED = makeOrderGroupRow({
  orderGroupId: '01GRPCONFIRMED00000000001',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-confirmed',
      sellerName: '멍멍마트',
      status: 'PURCHASE_CONFIRMED',
      items: [CONFIRMED_ITEM],
    }),
  ],
})

const CONFIRMED_WITH_RETURNED = makeOrderGroupRow({
  orderGroupId: '01GRPCONFMIX0000000000001',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-confirmed-mixed',
      sellerName: '멍멍마트',
      status: 'PURCHASE_CONFIRMED',
      items: [
        CONFIRMED_ITEM,
        makeOrderLineRow({
          orderItemId: 9002,
          productId: 'p-returned',
          productName: '반품된 간식',
          itemStatus: 'RETURNED',
        }),
      ],
    }),
  ],
})

const CANCELLED = makeOrderGroupRow({
  orderGroupId: '01GRPCANCEL000000000000001',
  orderedAt: '2026-10-02T15:44:00+09:00',
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-cancelled',
      sellerName: null,
      status: 'CANCELLED',
      items: [
        makeOrderLineRow({
          productName: '스크래쳐 하우스 2종 세트',
          optionName: '2종 세트',
          unitPrice: 29000,
        }),
      ],
    }),
  ],
})

describe('/orders 주문 목록', () => {
  it('[AC-ORDER-GUEST-001] 비회원은 주문 내역 대신 로그인 안내를 보고 서버를 부르지 않는다', async () => {
    // GET /order-groups는 회원 전용이다. 화면을 그대로 열면 401 → 전역 로그인 리다이렉트로
    // 빈 화면만 스치고 사라진다 — 왜 비었는지와 다음 행동을 그 자리에 보여준다.
    let requested = 0
    server.use(
      http.get(ORDER_GROUPS_URL, () => {
        requested += 1
        return HttpResponse.json({ data: { orderGroups: [], nextCursor: null, hasNext: false } })
      }),
    )
    logout()
    renderAt('/orders')

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 / 회원가입' })).toBeInTheDocument()
    expect(requested).toBe(0)
  })

  it('[AC-ORDER-GUEST-002] 비회원이 주문 상세·클레임 주소로 오면 로그인 안내를 보고 서버를 부르지 않는다', async () => {
    // 직접 주소로 들어온 비회원이 GET /orders/{id}의 401로 로그인 화면에 튕기면 돌아올 경로를 잃는다.
    let requested = 0
    server.use(
      http.get(ORDER_DETAIL_URL, () => {
        requested += 1
        return new HttpResponse(null, { status: 401 })
      }),
    )
    logout()
    const router = renderAt('/orders/ORD-1')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/orders/ORD-1')
    cleanup()

    const claimRouter = renderAt('/orders/ORD-1/claim?type=return')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(claimRouter.state.location.pathname).toBe('/orders/ORD-1/claim')
    expect(requested).toBe(0)
  })

  it('[AC-ORDER-ROUTE-001] 그룹 카드 안에 셀러 주문별 상태 pill을 보여준다(혼합 상태 그룹)', async () => {
    seedOrderGroups([MIXED, PAID_ONLY])
    renderAt('/orders')

    expect(await screen.findByText('총 2건')).toBeInTheDocument()
    expect(screen.getByText('츄르 참치맛 40개입 외 1개')).toBeInTheDocument()
    expect(screen.getByText('자동 리드줄 5m 대형견용')).toBeInTheDocument()
    expect(screen.getByText('배송중')).toBeInTheDocument()
    expect(screen.getByText('배송완료')).toBeInTheDocument()
    // 출고 대기(DISPATCH_PENDING)는 상품준비중으로 접힌다.
    expect(screen.getByText('상품준비중')).toBeInTheDocument()
    // 금액은 주문그룹 전체 값임을 라벨로 밝힌다.
    expect(screen.getAllByText('결제 금액(주문 전체)')).toHaveLength(2)
    expect(screen.getByText('86,000원')).toBeInTheDocument()
    // 취소·리뷰 CTA는 없다(BE 없음).
    expect(screen.queryByRole('button', { name: '리뷰 쓰기' })).not.toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-002] 완료 세그먼트는 status=completed로 조회하고 혼합 그룹의 배송중 주문도 함께 보인다', async () => {
    seedOrderGroups([MIXED, PAID_ONLY, CANCELLED])
    const statuses: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'GET' && request.url.startsWith(ORDER_GROUPS_URL)) {
        statuses.push(new URL(request.url).searchParams.get('status'))
      }
    })
    const user = userEvent.setup()
    renderAt('/orders')
    expect(await screen.findByText('총 3건')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '완료' }))
    expect(await screen.findByText('총 1건')).toBeInTheDocument()
    // 그룹은 통째로 오므로 배송중 셀러 주문도 같은 카드에 남는다.
    expect(screen.getByText('배송중')).toBeInTheDocument()
    expect(screen.getByText('배송완료')).toBeInTheDocument()
    expect(screen.queryByText('대용량 모래 8.5L 벤토나이트')).not.toBeInTheDocument()
    expect(statuses).toEqual(['all', 'completed'])

    await user.click(screen.getByRole('tab', { name: '취소' }))
    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
    expect(screen.getByText('판매자 정보 없음')).toBeInTheDocument()
    expect(screen.getByText('취소완료')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-003] 더보기로 다음 커서 페이지가 이어 붙는다', async () => {
    seedOrderGroups(
      Array.from({ length: 11 }, (_, i) =>
        makeOrderGroupRow({
          orderGroupId: `01GRPPAGE000000000000000${String(i).padStart(2, '0')}`,
          sellerOrders: [
            makeSellerOrderRow({
              orderId: `o-page-${i}`,
              items: [makeOrderLineRow({ productName: `페이지 상품 ${i}` })],
            }),
          ],
        }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/orders')

    expect(await screen.findByText('페이지 상품 0')).toBeInTheDocument()
    expect(screen.getByText('총 11건')).toBeInTheDocument()
    expect(screen.queryByText('페이지 상품 10')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByText('페이지 상품 10')).toBeInTheDocument()
    // 마지막 페이지 뒤에는 더보기가 없다. totalCount는 첫 페이지 값이 유지된다.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('총 11건')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-004] 주문이 없으면 빈 상태 안내를 보여준다', async () => {
    seedOrderGroups([])
    renderAt('/orders')
    expect(await screen.findByText('아직 주문 내역이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '쇼핑하러 가기' })).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-005] 목록 조회가 실패하면 빈 상태가 아니라 오류 안내와 다시 시도를 보여준다', async () => {
    seedOrderGroups([PAID_ONLY])
    let fail = true
    server.use(
      http.get(ORDER_GROUPS_URL, () => {
        if (!fail) return undefined
        return HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/orders')

    expect(await screen.findByText('주문 내역을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText('아직 주문 내역이 없어요')).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-006] 셀러 주문 행을 누르면 그 주문(orderId)의 상세로 간다', async () => {
    seedOrderGroups([MIXED])
    const user = userEvent.setup()
    const router = renderAt('/orders')

    await user.click(
      await screen.findByRole('button', { name: '자동 리드줄 5m 대형견용 주문 상세 보기' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o-mixed-done'))
    expect(await screen.findByText('주문번호')).toBeInTheDocument()
    expect(screen.getByText('o-mixed-done')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-024] 주문 내역의 홈 버튼을 누르면 홈으로 간다', async () => {
    seedOrderGroups([MIXED])
    const user = userEvent.setup()
    const router = renderAt('/orders')

    await user.click(await screen.findByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('오프라인(네트워크 paused)', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('[AC-ORDER-ROUTE-012] 오프라인 첫 진입의 목록은 "주문 없음"이 아니라 스켈레톤을 보여준다', async () => {
    seedOrderGroups([PAID_ONLY])
    onlineManager.setOnline(false)
    renderAt('/orders')

    expect(await screen.findByRole('tab', { name: '전체' })).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('아직 주문 내역이 없어요')).not.toBeInTheDocument()
    expect(screen.queryByText('주문 내역을 불러오지 못했어요')).not.toBeInTheDocument()

    // 다시 온라인이 되면 멈춰 있던 조회가 이어져 목록이 뜬다.
    onlineManager.setOnline(true)
    expect(await screen.findByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-013] 오프라인 첫 진입의 상세는 "찾을 수 없어요"가 아니라 스켈레톤을 보여준다', async () => {
    seedOrderGroups([MIXED])
    onlineManager.setOnline(false)
    renderAt('/orders/o-mixed-ship')

    expect(await screen.findByText('주문 상세')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('주문을 찾을 수 없어요')).not.toBeInTheDocument()
    expect(screen.queryByText('주문을 불러오지 못했어요')).not.toBeInTheDocument()

    onlineManager.setOnline(true)
    expect(await screen.findByText('o-mixed-ship')).toBeInTheDocument()
  })
})

describe('/orders/$orderId 주문 상세', () => {
  it('[AC-ORDER-ROUTE-007] 품목 전체·셀러 배송비·주문 전체 결제 금액을 라벨로 구분해 그린다', async () => {
    seedOrderGroups([MIXED])
    renderAt('/orders/o-mixed-ship')

    expect(await screen.findByText('o-mixed-ship')).toBeInTheDocument()
    expect(screen.getByText('2026.10.10 10:00')).toBeInTheDocument()
    expect(screen.getByText('주문 상품 / 냥이상점')).toBeInTheDocument()
    expect(screen.getByText('츄르 참치맛 40개입')).toBeInTheDocument()
    expect(screen.getByText('참치맛 / 40개입 / 3개')).toBeInTheDocument()
    // 취소된 품목은 상태 라벨이 붙는다.
    expect(screen.getByText('기본 / 1개 / 취소')).toBeInTheDocument()

    const payment = screen.getByText('이 주문의 배송비').closest('div') as HTMLElement
    expect(within(payment).getByText('결제 금액(주문 전체)')).toBeInTheDocument()
    expect(within(payment).getByText('86,000원')).toBeInTheDocument()
    expect(within(payment).getByText('-1,000원')).toBeInTheDocument()
    expect(within(payment).getAllByText('3,000원')).toHaveLength(2)

    // 배송지 스냅샷은 서버 응답에 있으므로 그린다(연락처는 숫자열을 하이픈으로 조립).
    expect(screen.getByText('배송지')).toBeInTheDocument()
    expect(screen.getByText('김집사 / 010-1234-5678')).toBeInTheDocument()
    // 배송중인데 송장이 없으면 "등록되면 보여드려요" 안내 — 가짜 운송장을 만들지 않는다.
    expect(screen.getByText(/송장이 등록되면/)).toBeInTheDocument()
    // 배송중 주문에는 구매확정·리뷰·취소 진입이 없다.
    expect(screen.queryByText(/자동으로 구매확정/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주문 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '구매확정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '리뷰 쓰기' })).not.toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-008] 없는 주문(404)은 "찾을 수 없어요"로 안내한다', async () => {
    seedOrderGroups([MIXED])
    renderAt('/orders/o-unknown')
    expect(await screen.findByText('주문을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문 내역으로' })).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-009] 상세 조회의 서버 오류는 1회 재시도 뒤 "없음"과 구분해 다시 시도를 보여준다', async () => {
    seedOrderGroups([MIXED])
    let calls = 0
    server.use(
      http.get(ORDER_DETAIL_URL, () => {
        calls += 1
        return HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 })
      }),
    )
    renderAt('/orders/o-mixed-ship')
    expect(await screen.findByText('주문을 불러오지 못했어요')).toBeInTheDocument()
    // 404가 아닌 실패는 어댑터가 정확히 1회 재시도한 뒤 오류로 떨어진다(최초 + 재시도 = 2회).
    expect(calls).toBe(2)
    expect(screen.queryByText('주문을 찾을 수 없어요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-011] 403처럼 404가 아닌 오류는 "찾을 수 없어요"가 아니라 사유 + 다시 시도다', async () => {
    seedOrderGroups([MIXED])
    server.use(
      http.get(ORDER_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 50002, message: 'forbidden' }, { status: 403 }),
      ),
    )
    renderAt('/orders/o-mixed-ship')
    expect(await screen.findByText('주문을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('주문을 볼 권한이 없어요')).toBeInTheDocument()
    expect(screen.queryByText('주문을 찾을 수 없어요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-010] 예전 취소 화면 URL은 취소 유형 클레임 요청으로 넘긴다', async () => {
    // 취소는 클레임 한 경로(POST /orders/{id}/claims)로 합쳐졌다 — 옛 링크를 끊지 않고 새 화면으로 보낸다.
    seedOrderGroups([PAID_ONLY])
    const router = renderAt('/orders/o-paid/cancel')
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o-paid/claim'))
    expect(router.state.location.search).toEqual({ type: 'cancel' })
    expect(await screen.findByText('취소 사유')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-023] 유형 없는 클레임 URL은 상세로 되돌린다(빈 폼을 띄우지 않는다)', async () => {
    seedOrderGroups([PAID_ONLY])
    const router = renderAt('/orders/o-paid/claim')
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o-paid'))
    expect(await screen.findByText('o-paid')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-014] 배송완료 상세는 송장·배송완료 시각과 자동확정 기한을 보여준다', async () => {
    seedOrderGroups([DELIVERED])
    renderAt('/orders/o-delivered')

    expect(await screen.findByText('배송 조회')).toBeInTheDocument()
    expect(screen.getByText('CJ대한통운')).toBeInTheDocument()
    expect(screen.getByText('1234567890')).toBeInTheDocument()
    expect(screen.getByText('10.11 09:00')).toBeInTheDocument()
    expect(screen.getByText('10.12 14:00')).toBeInTheDocument()
    // 추적 동기화 경로가 없어 lastTrackingStatus는 null — 빈 행을 만들지 않는다.
    expect(screen.queryByText('최근 상태')).not.toBeInTheDocument()
    expect(screen.getByText(/자동으로 구매확정/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '구매확정' })).toBeInTheDocument()
  })
})

describe('/orders/$orderId 구매확정', () => {
  it('[AC-ORDER-ROUTE-015] 구매확정은 확인 Modal을 거쳐야 요청된다(비가역 — 바로 mutate하지 않음)', async () => {
    seedOrderGroups([DELIVERED])
    const posts: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/confirm')) posts.push(request.url)
    })
    const user = userEvent.setup()
    renderAt('/orders/o-delivered')

    await user.click(await screen.findByRole('button', { name: '구매확정' }))
    expect(await screen.findByText('구매확정할까요?')).toBeInTheDocument()
    expect(screen.getByText(/되돌릴 수 없어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '확정할게요' })).toBeInTheDocument()
    // 아직 아무것도 보내지 않았다.
    expect(posts).toHaveLength(0)

    // 취소하면 요청 없이 닫힌다.
    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText('구매확정할까요?')).not.toBeInTheDocument())
    expect(posts).toHaveLength(0)
  })

  it('[AC-ORDER-ROUTE-016] 확인하면 POST /orders/{id}/confirm을 부르고 상세가 구매확정으로 갱신된다', async () => {
    seedOrderGroups([DELIVERED])
    const posts: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') posts.push(new URL(request.url).pathname)
    })
    const user = userEvent.setup()
    renderAt('/orders/o-delivered')

    await user.click(await screen.findByRole('button', { name: '구매확정' }))
    await user.click(screen.getByRole('button', { name: '확정할게요' }))

    expect(await screen.findByText('구매확정했어요. 적립금이 지급돼요')).toBeInTheDocument()
    await waitFor(() => expect(posts).toEqual(['/api/v1/orders/o-delivered/confirm']))
    // 캐시 무효화로 상세가 다시 오고, 구매확정 상태에서는 버튼이 사라지고 리뷰 진입이 열린다.
    expect(await screen.findByRole('button', { name: '리뷰 쓰기' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '구매확정' })).not.toBeInTheDocument(),
    )
  })

  it('[AC-ORDER-ROUTE-017] 이미 확정(409 50008)과 확정 불가(409 50007)를 다른 문구로 안내한다', async () => {
    seedOrderGroups([DELIVERED])
    let errorCode = 50008
    server.use(
      http.post(ORDER_CONFIRM_URL, () =>
        HttpResponse.json({ errorCode, message: 'conflict' }, { status: 409 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-delivered')

    await user.click(await screen.findByRole('button', { name: '구매확정' }))
    await user.click(screen.getByRole('button', { name: '확정할게요' }))
    expect(await screen.findByText('이미 구매확정된 주문이에요')).toBeInTheDocument()

    errorCode = 50007
    await user.click(await screen.findByRole('button', { name: '구매확정' }))
    await user.click(screen.getByRole('button', { name: '확정할게요' }))
    expect(await screen.findByText('구매확정할 수 없는 상태로 바뀌었어요')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-022] 확정 뒤 상세 재조회가 실패해도 확정 성공은 알린다(비가역 처리를 삼키지 않는다)', async () => {
    seedOrderGroups([DELIVERED])
    // 확정은 성공하지만 무효화로 생긴 재조회가 실패하는 상황. 어댑터가 onSettled에서 무효화를
    // await하므로 성공 콜백은 이 실패 뒤에 돈다 — 토스트가 상세 오류 분기에 가려지면 안 된다.
    let detailCalls = 0
    server.use(
      http.get(ORDER_DETAIL_URL, () => {
        detailCalls += 1
        return detailCalls === 1
          ? undefined
          : HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-delivered')

    await user.click(await screen.findByRole('button', { name: '구매확정' }))
    await user.click(screen.getByRole('button', { name: '확정할게요' }))

    expect(await screen.findByText('주문을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('구매확정했어요. 적립금이 지급돼요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-018] 진행 중 클레임이 있으면 구매확정도 새 요청도 막고 사유를 적는다', async () => {
    seedOrderGroups([CLAIM_IN_PROGRESS])
    renderAt('/orders/o-claim')

    expect(await screen.findByText('반품 요청')).toBeInTheDocument()
    expect(screen.getByText('회수 진행 중')).toBeInTheDocument()
    expect(screen.getByText('환불 요청됨')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '구매확정' })).not.toBeInTheDocument()
    // 진행 중에는 유형과 무관하게 새 요청을 받지 않는다(서버 409 50403).
    expect(screen.queryByRole('button', { name: '반품 신청' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '교환 신청' })).not.toBeInTheDocument()
    // 회수가 시작된 뒤에는 철회할 수 없다(서버 409 50402) — 버튼을 두지 않는다.
    expect(screen.queryByRole('button', { name: '요청 철회' })).not.toBeInTheDocument()
  })
})

describe('/orders/$orderId 리뷰·상품 진입', () => {
  it('[AC-ORDER-ROUTE-019] 구매확정 품목의 리뷰 쓰기는 orderItemId와 주문 스냅샷을 넘긴다', async () => {
    seedOrderGroups([CONFIRMED])
    const user = userEvent.setup()
    const router = renderAt('/orders/o-confirmed')

    await user.click(await screen.findByRole('button', { name: '리뷰 쓰기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/write'))
    expect(router.state.location.search).toEqual({
      productId: 'p-confirmed',
      orderItemId: 9001,
      productName: '유기농 수제 간식',
      option: '연어 / 200g',
    })
  })

  it('[AC-ORDER-ROUTE-020] 취소·반품 품목에는 리뷰 쓰기를 두지 않는다(서버가 110010으로 거절)', async () => {
    seedOrderGroups([CONFIRMED_WITH_RETURNED])
    renderAt('/orders/o-confirmed-mixed')

    expect(await screen.findByText('유기농 수제 간식')).toBeInTheDocument()
    expect(screen.getByText('반품된 간식')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '리뷰 쓰기' })).toHaveLength(1)
  })

  it('[AC-ORDER-ROUTE-021] 품목을 누르면 productId로 상품 상세로 간다', async () => {
    seedOrderGroups([CONFIRMED])
    const user = userEvent.setup()
    const router = renderAt('/orders/o-confirmed')

    await user.click(await screen.findByRole('button', { name: '유기농 수제 간식 상품 보기' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/products/p-confirmed'),
    )
  })

  it('[AC-ORDER-ROUTE-025] 주문 상세의 홈 버튼을 누르면 홈으로 간다', async () => {
    seedOrderGroups([CONFIRMED])
    const user = userEvent.setup()
    const router = renderAt('/orders/o-confirmed')

    expect(await screen.findByText('주문번호')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, it, expect } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'
import {
  CLAIM_REASONS_URL,
  ORDER_CLAIMS_URL,
  ORDER_CLAIM_URL,
  ORDER_DETAIL_URL,
  ORDER_GROUP_DETAIL_URL,
  makeClaimItem,
  makeOrderGroupRow,
  makeOrderLineRow,
  makeSellerOrderRow,
  seedOrderClaims,
  seedOrderGroups,
  server,
} from '@/testing/msw/server'

// 클레임(취소·반품·교환) 요청·내역·철회와 주문그룹 형제 주문. 서버 계약은 testing/msw/server.ts가
// 소유하고(유형별 요청 가능 상태·중복 차단·전량 제약·철회 가능 상태) 여기선 시나리오만 세운다.

// 주문 상세·클레임은 회원 전용 화면이라 회원 세션(메모리 토큰)을 전제로 연다.
beforeEach(() => setAccessToken('member-token'))

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
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

const DAY_MS = 24 * 60 * 60 * 1000
/** 반품 기한(배송완료 +7일) 안쪽 — 고정 날짜를 쓰면 기한이 지나 버려 테스트가 달력에 묶인다. */
const RECENTLY_DELIVERED_AT = new Date(Date.now() - 2 * DAY_MS).toISOString()
/** 기한을 확실히 넘긴 시각. */
const LONG_AGO_DELIVERED_AT = new Date(Date.now() - 30 * DAY_MS).toISOString()

const SNACK = makeOrderLineRow({
  orderItemId: 7001,
  productId: 'p-snack',
  productName: '유기농 수제 간식',
  optionName: '연어 / 200g',
  quantity: 2,
  unitPrice: 12000,
})

const TOY = makeOrderLineRow({
  orderItemId: 7002,
  productId: 'p-toy',
  productName: '삑삑 공',
  optionName: '기본',
  quantity: 1,
  unitPrice: 8000,
})

/** 발송 전(출고 대기) — 취소만 받는 상태. */
const BEFORE_DISPATCH = makeOrderGroupRow({
  orderGroupId: '01GRPCANCELABLE0000000001',
  totalProductAmount: 32000,
  totalShippingFee: 3000,
  usedPoint: 0,
  finalPaymentAmount: 35000,
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-cancelable',
      sellerName: '스마트펫',
      status: 'DISPATCH_PENDING',
      sellerShippingFee: 3000,
      items: [{ ...SNACK }, { ...TOY }],
    }),
  ],
})

/** 배송완료(기한 안) — 반품·교환을 받는 상태. */
function deliveredGroup(deliveredAt: string) {
  return makeOrderGroupRow({
    orderGroupId: '01GRPDELIVERED0000000002',
    totalProductAmount: 24000,
    totalShippingFee: 0,
    usedPoint: 0,
    finalPaymentAmount: 24000,
    sellerOrders: [
      makeSellerOrderRow({
        orderId: 'o-returnable',
        sellerName: '멍멍마트',
        status: 'DELIVERED',
        items: [{ ...SNACK }],
        purchaseConfirmDueAt: '2026-12-01T14:00:00+09:00',
        shipment: {
          courierCode: 'CJ',
          courierName: 'CJ대한통운',
          trackingNumber: '1234567890',
          dispatchedAt: '2026-10-11T09:00:00+09:00',
          deliveredAt,
          lastTrackingStatus: null,
        },
      }),
    ],
  })
}

/** 한 결제에 셀러 둘 — 형제 주문 카드가 뜨는 조건. */
const TWO_SELLERS = makeOrderGroupRow({
  orderGroupId: '01GRPTWOSELLERS000000001',
  totalProductAmount: 32000,
  totalShippingFee: 0,
  usedPoint: 0,
  finalPaymentAmount: 32000,
  sellerOrders: [
    makeSellerOrderRow({
      orderId: 'o-first',
      sellerName: '스마트펫',
      status: 'SHIPPING',
      items: [{ ...SNACK }],
    }),
    makeSellerOrderRow({
      orderId: 'o-second',
      sellerName: '멍멍마트',
      status: 'DELIVERED',
      items: [{ ...TOY }],
    }),
  ],
})

describe('/orders/$orderId 클레임 요청 진입점', () => {
  it('[AC-CLAIM-001] 발송 전 주문에는 취소만, 배송완료 주문에는 반품·교환만 둔다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    renderAt('/orders/o-cancelable')

    expect(await screen.findByRole('button', { name: '주문 취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '반품 신청' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '교환 신청' })).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-002] 배송완료 주문은 반품·교환을 받고 취소는 받지 않는다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    renderAt('/orders/o-returnable')

    expect(await screen.findByRole('button', { name: '반품 신청' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '교환 신청' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '주문 취소' })).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-003] 반품 기한(배송완료 +7일)이 지나면 진입점을 두지 않는다', async () => {
    seedOrderGroups([deliveredGroup(LONG_AGO_DELIVERED_AT)])
    renderAt('/orders/o-returnable')

    // 구매확정은 여전히 되지만(서버 조건이 다르다) 반품·교환은 서버가 409 50401로 거절한다.
    expect(await screen.findByRole('button', { name: '구매확정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '반품 신청' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '교환 신청' })).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-004] 진입점은 유형을 쿼리로 실어 클레임 화면으로 보낸다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    const user = userEvent.setup()
    const router = renderAt('/orders/o-returnable')

    await user.click(await screen.findByRole('button', { name: '교환 신청' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/orders/o-returnable/claim'),
    )
    expect(router.state.location.search).toEqual({ type: 'exchange' })
  })
})

describe('/orders/$orderId/claim 사유 선택지', () => {
  it('[AC-CLAIM-005] 선택지는 서버가 준 목록과 문구를 그대로 쓴다(화면이 어휘를 들지 않는다)', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    renderAt('/orders/o-returnable/claim?type=exchange')

    // 교환 선택지에는 단순 변심이 없다(be ClaimReasonCode.selectableFor) — 유형별 목록이 서버 것이라는 증거.
    expect(await screen.findByText('상품이 파손되었거나 불량이에요')).toBeInTheDocument()
    expect(screen.getByText('주문과 다른 상품이 왔어요')).toBeInTheDocument()
    expect(screen.getByText('옵션을 잘못 선택했어요')).toBeInTheDocument()
    expect(screen.queryByText('단순 변심')).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-006] 사유 경로가 아직 없으면(404) 화면이 죽지 않고 접수를 잠근다', async () => {
    // SCRUM-273(BE #150) 머지 전 dev 상태. 하드코딩 선택지로 되살리지 않는다 —
    // 없는 어휘로 보내면 머지 뒤 400 50412로 거절되므로 실패를 뒤로 미루기만 한다.
    server.use(
      http.get(CLAIM_REASONS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'Not Found' }, { status: 404 }),
      ),
    )
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    renderAt('/orders/o-returnable/claim?type=return')

    expect(await screen.findByText('아직 요청 사유를 받을 준비가 안 됐어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '반품 신청하기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    // 선택지를 만들어 내지 않는다.
    expect(screen.queryByText('단순 변심')).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-007] 기타 사유는 상세 입력을 채워야 접수할 수 있다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    const user = userEvent.setup()
    renderAt('/orders/o-returnable/claim?type=return')

    await user.click(await screen.findByText('기타'))
    // detailRequired가 켜진 선택지라 상세 입력이 나타나고, 비어 있으면 버튼이 잠긴다.
    expect(screen.getByRole('button', { name: '반품 신청하기' })).toBeDisabled()
    await user.type(screen.getByLabelText('상세 사유'), '설명과 재질이 달라요')
    expect(screen.getByRole('button', { name: '반품 신청하기' })).toBeEnabled()
  })

  it('[AC-CLAIM-008] 사유를 바꾸면 이전 사유에 쓴 상세 설명을 지운다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    const user = userEvent.setup()
    renderAt('/orders/o-returnable/claim?type=return')

    await user.click(await screen.findByText('기타'))
    await user.type(screen.getByLabelText('상세 사유'), '맥락이 있는 설명')
    await user.click(screen.getByText('단순 변심'))
    await user.click(screen.getByText('기타'))
    expect(screen.getByLabelText('상세 사유')).toHaveValue('')
  })
})

describe('/orders/$orderId/claim 접수', () => {
  it('[AC-CLAIM-009] 접수하면 서버가 확정한 환불액을 보여준다(화면이 계산하지 않는다)', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    await user.click(await screen.findByText('단순 변심'))
    await user.click(screen.getByRole('button', { name: '주문 취소하기' }))
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    expect(await screen.findByText('취소를 접수했어요')).toBeInTheDocument()
    // 품목 24,000 + 8,000 + 이 셀러 주문 배송비 3,000 = 35,000(서버 계산값).
    expect(screen.getByText('35,000원')).toBeInTheDocument()
  })

  it('[AC-CLAIM-010] 품목을 골라 접수하면 고른 품목만 전량으로 보낸다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    let body: unknown
    server.use(
      http.post(ORDER_CLAIMS_URL, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            data: {
              claimPublicId: 'CLAIMX',
              claimType: 'CANCEL',
              status: 'CLAIM_REQUESTED',
              refundAmount: 11000,
              sellerApprovalStatus: 'REQUESTED',
              autoApproveDueAt: null,
              requestedAt: null,
            },
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    // 두 품목 중 간식을 뺀다 — 체크박스 라벨 대신 상품명 버튼을 누르는 것이 관례(sr-only input).
    await user.click(await screen.findByText('유기농 수제 간식'))
    await user.click(screen.getByText('단순 변심'))
    await user.click(screen.getByRole('button', { name: '주문 취소하기' }))
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    await waitFor(() => expect(body).toBeDefined())
    // 수량을 쪼갠 요청은 서버가 422 50410으로 거절하므로 늘 주문 수량 그대로 보낸다.
    expect(body).toEqual({
      claimType: 'CANCEL',
      reasonCode: 'CHANGE_OF_MIND',
      items: [{ orderItemId: 7002, quantity: 1 }],
    })
  })

  it('[AC-CLAIM-011] 품목을 모두 빼면 접수할 수 없다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    await user.click(await screen.findByText('단순 변심'))
    await user.click(screen.getByText('유기농 수제 간식'))
    await user.click(screen.getByText('삑삑 공'))
    expect(screen.getByText('상품을 하나 이상 선택해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문 취소하기' })).toBeDisabled()
  })

  it('[AC-CLAIM-012] 접수가 중복으로 거절되면(409 50403) 사유를 그대로 알린다', async () => {
    // 화면이 고른 품목이 비어 있다고 봤는데 그 사이 다른 클레임이 접수된 경합 — 서버 판정이 심판이다.
    seedOrderGroups([BEFORE_DISPATCH])
    server.use(
      http.post(ORDER_CLAIMS_URL, () =>
        HttpResponse.json(
          { errorCode: 50403, message: '이미 진행 중인 클레임이 있는 상품입니다.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    await user.click(await screen.findByText('단순 변심'))
    await user.click(screen.getByRole('button', { name: '주문 취소하기' }))
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    expect(await screen.findByText('이미 진행 중인 요청이 있어요')).toBeInTheDocument()
  })

  it('[AC-CLAIM-012b] 다른 품목에 클레임이 있어도 남은 품목은 신청할 수 있다(서버는 품목 단위로 막는다)', async () => {
    // be ClaimService.rejectIfAlreadyClaimed는 이번 요청의 대상 품목만 본다 — 주문 전체를 잠그면
    // 서버가 받아 주는 요청을 화면이 막는다.
    seedOrderGroups([BEFORE_DISPATCH])
    seedOrderClaims('o-cancelable', [
      makeClaimItem({
        claimPublicId: 'CLAIMHELD7001',
        claimType: 'CANCEL',
        status: 'CLAIM_REQUESTED',
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 24000 }],
      }),
    ])
    let body: unknown
    server.use(
      http.post(ORDER_CLAIMS_URL, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(
          {
            data: {
              claimPublicId: 'CLAIMNEW',
              claimType: 'CANCEL',
              status: 'CLAIM_REQUESTED',
              refundAmount: 8000,
              sellerApprovalStatus: 'REQUESTED',
              autoApproveDueAt: null,
              requestedAt: null,
            },
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    // 잡힌 간식은 대상에서 빠지고 남은 공 하나만 뜬다(품목이 하나면 체크박스 없이 읽기 전용).
    expect(await screen.findByText('삑삑 공')).toBeInTheDocument()
    expect(screen.queryByText('유기농 수제 간식')).not.toBeInTheDocument()

    await user.click(screen.getByText('단순 변심'))
    await user.click(screen.getByRole('button', { name: '주문 취소하기' }))
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toEqual({
      claimType: 'CANCEL',
      reasonCode: 'CHANGE_OF_MIND',
      items: [{ orderItemId: 7002, quantity: 1 }],
    })
    expect(await screen.findByText('취소를 접수했어요')).toBeInTheDocument()
  })

  it('[AC-CLAIM-012c] 접수 성공 뒤 상세 재조회가 실패해도 접수 결과와 환불액을 보여준다', async () => {
    // 요청 어댑터가 onSettled에서 주문 캐시를 무효화하므로 성공 직후 상세 재조회가 돈다 —
    // 그 실패가 접수 결과를 덮으면 서버가 확정한 환불액(이 응답에만 있는 값)을 아무도 못 본다.
    seedOrderGroups([BEFORE_DISPATCH])
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    await user.click(await screen.findByText('단순 변심'))
    server.use(
      http.get(ORDER_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '주문 취소하기' }))
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    expect(await screen.findByText('취소를 접수했어요')).toBeInTheDocument()
    expect(screen.getByText('35,000원')).toBeInTheDocument()
    expect(screen.queryByText('주문을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-012d] 확인 버튼을 연타해도 요청은 한 번만 나간다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    let posts = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ORDER_CLAIMS_URL, async () => {
        posts += 1
        await gate
        return HttpResponse.json(
          {
            data: {
              claimPublicId: 'CLAIMONCE',
              claimType: 'CANCEL',
              status: 'CLAIM_REQUESTED',
              refundAmount: 35000,
              sellerApprovalStatus: 'REQUESTED',
              autoApproveDueAt: null,
              requestedAt: null,
            },
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable/claim?type=cancel')

    await user.click(await screen.findByText('단순 변심'))
    const cta = screen.getByRole('button', { name: '주문 취소하기' })
    await user.click(cta)
    await user.click(screen.getByRole('button', { name: '취소 신청할게요' }))

    // 요청이 떠 있는 동안 CTA는 잠겨 다시 열 수 없다(DS Button이 loading을 disabled로 바꾼다).
    await waitFor(() => expect(posts).toBe(1))
    expect(screen.getByRole('button', { name: '주문 취소하기' })).toBeDisabled()
    release?.()
    expect(await screen.findByText('취소를 접수했어요')).toBeInTheDocument()
    expect(posts).toBe(1)
  })

  it('[AC-CLAIM-013] 진행 중 클레임이 있으면 폼 대신 사유를 먼저 설명한다', async () => {
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: '01GRPHELD000000000000001',
        totalProductAmount: 24000,
        totalShippingFee: 0,
        usedPoint: 0,
        finalPaymentAmount: 24000,
        sellerOrders: [
          makeSellerOrderRow({
            orderId: 'o-held',
            sellerName: '멍멍마트',
            status: 'DELIVERED',
            items: [{ ...SNACK, itemStatus: 'RETURN_REQUESTED' }],
            activeClaim: {
              claimPublicId: 'CLAIMHELD',
              claimType: 'RETURN',
              status: 'CLAIM_REQUESTED',
              refundStatus: 'NONE',
            },
          }),
        ],
      }),
    ])
    renderAt('/orders/o-held/claim?type=exchange')

    expect(await screen.findByText('이미 진행 중인 요청이 있어요')).toBeInTheDocument()
    expect(screen.queryByText('교환 사유')).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-014] 서버가 받지 않는 유형으로 들어오면 폼 대신 조건을 설명한다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    renderAt('/orders/o-cancelable/claim?type=return')

    expect(await screen.findByText('반품 신청을 할 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('반품 사유')).not.toBeInTheDocument()
  })
})

describe('/orders/$orderId 클레임 내역·철회', () => {
  it('[AC-CLAIM-015] 내역은 거부·철회된 과거 건까지 보여주고 거부 사유를 그대로 적는다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    seedOrderClaims('o-returnable', [
      makeClaimItem({
        claimPublicId: 'CLAIMREJ',
        claimType: 'RETURN',
        status: 'REJECTED',
        sellerApprovalStatus: 'REJECTED',
        refundStatus: 'NONE',
        refundAmount: 24000,
        rejectionReason: '사용 흔적이 있어 반품이 어려워요',
        resolvedAt: '2026-10-21T10:00:00',
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 24000 }],
      }),
      makeClaimItem({
        claimPublicId: 'CLAIMWDR',
        claimType: 'EXCHANGE',
        status: 'WITHDRAWN',
        sellerApprovalStatus: 'REQUESTED',
        refundStatus: null,
        refundAmount: 0,
        resolvedAt: '2026-10-22T10:00:00',
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 0 }],
      }),
    ])
    renderAt('/orders/o-returnable')

    expect(await screen.findByText('거부')).toBeInTheDocument()
    expect(screen.getByText('철회')).toBeInTheDocument()
    expect(screen.getByText('거부 사유 / 사용 흔적이 있어 반품이 어려워요')).toBeInTheDocument()
    // 두 건이 같은 품목을 가리켜 대상 요약이 두 번 그려진다 — 건마다 대상을 적는다는 뜻이다.
    expect(screen.getAllByText('유기농 수제 간식 (2개)')).toHaveLength(2)
    // 종결된 건에는 철회 버튼이 없다(서버가 409 50402로 거절).
    expect(screen.queryByRole('button', { name: '요청 철회' })).not.toBeInTheDocument()
    // 품목이 풀렸으니 다시 신청할 수 있다.
    expect(screen.getByRole('button', { name: '반품 신청' })).toBeInTheDocument()
  })

  it('[AC-CLAIM-016] 셀러 판단 전 요청은 철회할 수 있고 철회하면 내역이 갱신된다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    seedOrderClaims('o-cancelable', [
      makeClaimItem({
        claimPublicId: 'CLAIMWITHDRAWABLE',
        claimType: 'CANCEL',
        status: 'CLAIM_REQUESTED',
        refundAmount: 35000,
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 24000 }],
      }),
    ])
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable')

    await user.click(await screen.findByRole('button', { name: '요청 철회' }))
    await user.click(screen.getByRole('button', { name: '철회할게요' }))

    expect(await screen.findByText('취소 요청을 철회했어요')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('철회')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '요청 철회' })).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-017] 철회가 거절되면(409 50402) 사유를 알리고 내역을 그대로 둔다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    seedOrderClaims('o-cancelable', [
      makeClaimItem({
        claimPublicId: 'CLAIMRACE',
        claimType: 'CANCEL',
        status: 'CLAIM_REQUESTED',
        refundAmount: 35000,
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 24000 }],
      }),
    ])
    server.use(
      http.delete(ORDER_CLAIM_URL, () =>
        HttpResponse.json(
          { errorCode: 50402, message: '허용되지 않은 클레임 상태 전이입니다.' },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderAt('/orders/o-cancelable')

    await user.click(await screen.findByRole('button', { name: '요청 철회' }))
    await user.click(screen.getByRole('button', { name: '철회할게요' }))

    expect(await screen.findByText('판매자가 이미 확인해서 철회할 수 없어요')).toBeInTheDocument()
  })

  it('[AC-CLAIM-018] 내역 조회가 실패해도 진행 중 클레임은 상세 응답으로 보여준다', async () => {
    // 진행 중 건은 구매확정을 잠그는 근거라 어떤 경우에도 화면에 있어야 한다.
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: '01GRPFALLBACK00000000001',
        totalProductAmount: 24000,
        totalShippingFee: 0,
        usedPoint: 0,
        finalPaymentAmount: 24000,
        sellerOrders: [
          makeSellerOrderRow({
            orderId: 'o-fallback',
            sellerName: '멍멍마트',
            status: 'DELIVERED',
            items: [{ ...SNACK, itemStatus: 'RETURN_REQUESTED' }],
            activeClaim: {
              claimPublicId: 'CLAIMACTIVE',
              claimType: 'RETURN',
              status: 'CLAIM_REQUESTED',
              refundStatus: 'NONE',
            },
          }),
        ],
      }),
    ])
    server.use(
      http.get(ORDER_CLAIMS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    renderAt('/orders/o-fallback')

    expect(await screen.findByText('반품 요청')).toBeInTheDocument()
    expect(screen.getByText('판매자 확인 대기')).toBeInTheDocument()
    // 상세 응답에는 대상 품목이 없다 — "주문 전체"로 위장하지 않고 모른다고 적는다.
    expect(screen.getByText('신청 상품은 내역을 불러온 뒤 확인할 수 있어요')).toBeInTheDocument()
    // 실패를 "없음"으로 위장하지 않는다.
    expect(screen.getByText(/요청 내역을 불러오지 못했어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    // 철회는 상세 응답만으로도 할 수 있다(claimPublicId가 거기 있다).
    expect(screen.getByRole('button', { name: '요청 철회' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '구매확정' })).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-019] 클레임이 없는 주문에는 내역 카드를 두지 않는다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    renderAt('/orders/o-cancelable')

    expect(await screen.findByText('o-cancelable')).toBeInTheDocument()
    expect(screen.queryByText('취소/반품/교환 요청')).not.toBeInTheDocument()
  })
})

describe('/orders/$orderId 같은 결제의 다른 주문', () => {
  it('[AC-CLAIM-020] 주문그룹 조회로 형제 주문을 보여주고 눌러서 옮겨간다', async () => {
    seedOrderGroups([TWO_SELLERS])
    const user = userEvent.setup()
    const router = renderAt('/orders/o-first')

    const card = (await screen.findByText('같은 결제의 다른 주문')).closest('div')
    expect(card).not.toBeNull()
    // 자기 자신은 목록에 없다.
    expect(within(card as HTMLElement).queryByText('스마트펫')).not.toBeInTheDocument()

    await user.click(within(card as HTMLElement).getByText('멍멍마트'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/o-second'))
  })

  it('[AC-CLAIM-021] 형제 주문이 없으면 카드 대신 주문 내역 안내만 남긴다', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    renderAt('/orders/o-cancelable')

    expect(await screen.findByText('o-cancelable')).toBeInTheDocument()
    expect(screen.queryByText('같은 결제의 다른 주문')).not.toBeInTheDocument()
    expect(
      screen.getByText(/같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요/),
    ).toBeInTheDocument()
  })

  it('[AC-CLAIM-022] 주문그룹 조회가 실패하면 "형제 주문 없음"으로 위장하지 않고 사실을 적는다', async () => {
    seedOrderGroups([TWO_SELLERS])
    server.use(
      http.get(ORDER_GROUP_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 50109, message: '주문 정보를 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderAt('/orders/o-first')

    expect(await screen.findByText('o-first')).toBeInTheDocument()
    // 조회가 끝나기 전에 통과하지 않도록 오류 문구가 뜨는 것을 먼저 기다린다.
    expect(
      await screen.findByText('같은 결제의 다른 주문을 불러오지 못했어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('같은 결제의 다른 주문')).not.toBeInTheDocument()
    // 대체 경로(주문 내역)는 그대로 남는다 — 보조 카드 하나가 상세를 죽이지 않는다.
    expect(
      screen.getByText(/같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요/),
    ).toBeInTheDocument()
  })

  it('[AC-CLAIM-023] 형제 주문이 정말 없으면 오류 문구를 적지 않는다(없음과 실패를 가른다)', async () => {
    seedOrderGroups([BEFORE_DISPATCH])
    renderAt('/orders/o-cancelable')

    expect(
      await screen.findByText(/같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('같은 결제의 다른 주문을 불러오지 못했어요.'),
    ).not.toBeInTheDocument()
  })
})

describe('/orders/$orderId 교환 내역의 환불 표시', () => {
  it('[AC-CLAIM-024] 교환 건에 금액이 실려 와도 환불로 그리지 않는다(나가지 않는 돈이다)', async () => {
    // be ClaimService는 유형을 가리지 않고 ClaimAmountCalculator를 부르므로 교환 응답에도 금액이
    // 온다 — 실제 환불 집행만 ClaimType.REFUNDABLE에서 교환을 뺀다.
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    seedOrderClaims('o-returnable', [
      makeClaimItem({
        claimPublicId: 'CLAIMEXC',
        claimType: 'EXCHANGE',
        status: 'CLAIM_REQUESTED',
        refundStatus: 'NONE',
        // 결제 금액(24,000원)과 겹치지 않는 값을 써서 환불 줄이 사라진 것을 확실히 본다.
        refundAmount: 21000,
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 21000 }],
      }),
    ])
    renderAt('/orders/o-returnable')

    expect(await screen.findByText('교환 요청')).toBeInTheDocument()
    expect(screen.queryByText('환불 금액')).not.toBeInTheDocument()
    expect(screen.queryByText('21,000원')).not.toBeInTheDocument()
  })

  it('[AC-CLAIM-025] 반품 건은 서버가 확정한 환불 금액을 그대로 적는다', async () => {
    seedOrderGroups([deliveredGroup(RECENTLY_DELIVERED_AT)])
    seedOrderClaims('o-returnable', [
      makeClaimItem({
        claimPublicId: 'CLAIMRET',
        claimType: 'RETURN',
        status: 'CLAIM_REQUESTED',
        refundStatus: 'NONE',
        refundAmount: 21000,
        items: [{ orderItemId: 7001, productName: '유기농 수제 간식', quantity: 2, refundAmount: 21000 }],
      }),
    ])
    renderAt('/orders/o-returnable')

    expect(await screen.findByText('환불 금액')).toBeInTheDocument()
    expect(screen.getByText('21,000원')).toBeInTheDocument()
  })
})

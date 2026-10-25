import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SELLER_ORDERS_URL,
  currentSellerOrders,
  lastSellerOrdersQuery,
  lastShipmentRegisterBody,
  makeSellerOrderLineWire,
  makeSellerOrderWire,
  seedCouriers,
  seedSellerOrders,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081)의 /sellers/me/orders 5경로와 /sellers/couriers를 가로챈다.
// 모듈 모킹이 아니라 네트워크 레벨이라 URL(특히 **단수** `shipment`)·호스트·envelope·에러 계약까지
// 함께 검증되고, test-setup의 onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
function renderOrders() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/orders'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement

// 서버 OrderStatus 8종 가운데 목록에 실제로 오는 상태를 고르게 깐다.
const NEW_ORDER = makeSellerOrderWire({
  status: 'PAID',
  recipientName: '김보호',
  contactNumber: '01012345678',
  itemCount: 2,
  payableAmount: 33000,
})
const PREPARING = makeSellerOrderWire({ status: 'PREPARING', recipientName: '이수민' })
// 발송 대기(DISPATCH_PENDING)도 송장 등록을 받는다 — 세그먼트가 PREPARING과 함께 묶인다.
const DISPATCH_PENDING = makeSellerOrderWire({ status: 'DISPATCH_PENDING', recipientName: '박지훈' })
const SHIPPING = makeSellerOrderWire({
  status: 'SHIPPING',
  recipientName: '최은영',
  shipment: {
    courierCode: 'CJ',
    courierName: 'CJ대한통운',
    trackingNumber: '601234567890',
    dispatchedAt: '2026-10-24T14:00:00',
    deliveredAt: null,
    lastTrackingStatus: '간선상차',
  },
})
const DELIVERED = makeSellerOrderWire({
  status: 'DELIVERED',
  recipientName: '정하늘',
  purchaseConfirmDueAt: '2026-11-01T09:00:00',
})
const CANCELLED = makeSellerOrderWire({ status: 'CANCELLED', recipientName: '한여울' })
const CLAIMED = makeSellerOrderWire({
  status: 'DELIVERED',
  recipientName: '오세림',
  activeClaim: { claimId: '01JMSWCLAIM0000000000001', claimType: 'RETURN', status: 'COLLECTING' },
})

function seedAll() {
  seedSellerOrders([
    { order: NEW_ORDER },
    { order: PREPARING },
    { order: DISPATCH_PENDING },
    { order: SHIPPING },
    { order: DELIVERED },
    { order: CANCELLED },
    { order: CLAIMED },
  ])
}

beforeEach(() => {
  seedCouriers()
  seedAll()
})

describe('셀러 주문 목록 실연동', () => {
  it('[AC-SORDER-001] 목록을 서버에서 받아 상태 라벨과 결제금액을 그린다', async () => {
    renderOrders()

    const row = await rowOf(NEW_ORDER.orderId)
    expect(within(row).getByText('신규 주문')).toBeInTheDocument()
    expect(within(row).getByText('33,000원')).toBeInTheDocument()
    expect(within(row).getByText('2개')).toBeInTheDocument()
    // 서버 OrderStatus 8종을 화면 문구로 접는다 — 추측이 아니라 be enum이 정본이다.
    expect(within(await rowOf(PREPARING.orderId)).getByText('상품준비중')).toBeInTheDocument()
    expect(within(await rowOf(DISPATCH_PENDING.orderId)).getByText('발송 대기')).toBeInTheDocument()
    expect(within(await rowOf(SHIPPING.orderId)).getByText('배송중')).toBeInTheDocument()
    expect(within(await rowOf(DELIVERED.orderId)).getByText('배송완료')).toBeInTheDocument()
    expect(within(await rowOf(CANCELLED.orderId)).getByText('취소완료')).toBeInTheDocument()
    expect(await screen.findByText('총 7건')).toBeInTheDocument()
  })

  it('[AC-SORDER-002] 첫 조회는 status=all만 보내고 빈 값 파라미터를 키째 뺀다', async () => {
    renderOrders()

    await screen.findByText(NEW_ORDER.orderId)
    // `?keyword=`·`?orderedFrom=`은 BE가 미입력이 아니라 형식 오류로 거절한다.
    await waitFor(() => expect(lastSellerOrdersQuery()).toBe('status=all&page=0'))
  })

  it('[AC-SORDER-003] 상태 세그먼트는 enum 이름이 아니라 서버 세그먼트 어휘로 나간다', async () => {
    const user = userEvent.setup()
    renderOrders()
    await screen.findByText(NEW_ORDER.orderId)

    await user.click(screen.getByRole('button', { name: '발송 대기' }))

    // PREPARING·DISPATCH_PENDING을 한 세그먼트로 묶는 쪽은 서버다 — FE가 상태를 쪼개 보내면 안 된다.
    await waitFor(() => expect(lastSellerOrdersQuery()).toBe('status=awaiting-dispatch&page=0'))
    expect(await screen.findByText(PREPARING.orderId)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(SHIPPING.orderId)).not.toBeInTheDocument())
  })

  it('[AC-SORDER-004] 검색어와 주문일 범위를 서버 파라미터로 넘긴다', async () => {
    const user = userEvent.setup()
    renderOrders()
    await screen.findByText(NEW_ORDER.orderId)

    await user.type(screen.getByPlaceholderText('주문번호 / 수령인 / 구매자'), '김보호')

    await waitFor(() => expect(lastSellerOrdersQuery()).toBe('status=all&keyword=%EA%B9%80%EB%B3%B4%ED%98%B8&page=0'))
  })

  it('[AC-SORDER-005] 목록의 연락처는 가운데를 가리고 상세에서는 그대로 보여준다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(NEW_ORDER.orderId)
    // 서버는 평문을 준다(be 주석: "마스킹은 화면이 한다") — 목록은 가리고, 송장을 붙이는 상세는 온전히.
    expect(within(row).getByText('010-****-5678')).toBeInTheDocument()
    expect(within(row).queryByText('01012345678')).not.toBeInTheDocument()

    await user.click(row)

    expect(await screen.findByText('01012345678')).toBeInTheDocument()
  })

  it('[AC-SORDER-006] 조회 실패는 빈 상태가 아니라 오류 안내와 다시 시도로 드러낸다', async () => {
    server.use(
      http.get(SELLER_ORDERS_URL, () =>
        HttpResponse.json({ errorCode: 40006, message: '조회 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderOrders()

    expect(await screen.findByText('주문을 조회할 수 있는 계정이 아니에요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    // "조건에 맞는 주문이 없어요"로 떨어지면 셀러가 필터를 의심한다.
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
  })
})

describe('셀러 주문 처리 실연동', () => {
  it('[AC-SORDER-007] 발주 확인은 확인 Modal을 거쳐 PAID→PREPARING으로 전이한다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(NEW_ORDER.orderId)
    await user.click(within(row).getByRole('button', { name: `주문 ${NEW_ORDER.orderId} 발주 확인` }))

    // 되돌릴 수 없는 전이라 즉시 mutate하지 않는다.
    expect(await screen.findByText('발주를 확인할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '발주 확인' }))

    expect(await screen.findByText('발주를 확인했어요.')).toBeInTheDocument()
    expect(currentSellerOrders().find(o => o.orderId === NEW_ORDER.orderId)?.status).toBe('PREPARING')
  })

  it('[AC-SORDER-008] 송장 등록은 단수 shipment 경로로 courierCode를 그대로 보낸다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(PREPARING.orderId)
    await user.click(within(row).getByRole('button', { name: `주문 ${PREPARING.orderId} 발송 처리` }))

    // '발송 처리'는 Modal 제목과 행 버튼 양쪽에 있다 — Modal 고유 컨트롤로 열림을 기다린다.
    await user.selectOptions(await screen.findByLabelText('택배사'), 'CJ')
    await user.type(screen.getByLabelText('운송장 번호'), '601234567891')
    await user.click(screen.getByRole('button', { name: '발송 확정' }))

    expect(await screen.findByText('발송을 확정했어요.')).toBeInTheDocument()
    // 코드는 서버 마스터 값 그대로다 — 소문자로 보내면 404/50303이다.
    expect(lastShipmentRegisterBody()).toEqual({ courierCode: 'CJ', trackingNumber: '601234567891' })
    const after = currentSellerOrders().find(o => o.orderId === PREPARING.orderId)
    // PREPARING에서 불러도 서버가 2단 전이해 SHIPPING이 된다.
    expect(after?.status).toBe('SHIPPING')
    expect(after?.shipment?.courierName).toBe('CJ대한통운')
  })

  it('[AC-SORDER-009] 송장번호가 택배사 형식과 맞지 않으면 보내기 전에 막는다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(PREPARING.orderId)
    await user.click(within(row).getByRole('button', { name: `주문 ${PREPARING.orderId} 발송 처리` }))

    // '발송 처리'는 Modal 제목과 행 버튼 양쪽에 있다 — Modal 고유 컨트롤로 열림을 기다린다.
    await user.selectOptions(await screen.findByLabelText('택배사'), 'CJ')
    // CJ 패턴은 ^\d{10,12}$ — 9자리는 서버가 400/50304로 거절한다.
    await user.type(screen.getByLabelText('운송장 번호'), '601234567')
    await user.click(screen.getByRole('button', { name: '발송 확정' }))

    expect(
      await screen.findByText('선택한 택배사의 운송장 번호 형식과 맞지 않아요.'),
    ).toBeInTheDocument()
    expect(lastShipmentRegisterBody()).toBeNull()
  })

  it('[AC-SORDER-010] 배송 완료는 확인 Modal을 거쳐 SHIPPING→DELIVERED로 전이한다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(SHIPPING.orderId)
    await user.click(within(row).getByRole('button', { name: `주문 ${SHIPPING.orderId} 배송 완료` }))

    expect(await screen.findByText('배송 완료로 처리할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '배송 완료' }))

    expect(await screen.findByText('배송 완료로 처리했어요.')).toBeInTheDocument()
    expect(currentSellerOrders().find(o => o.orderId === SHIPPING.orderId)?.status).toBe('DELIVERED')
  })

  it('[AC-SORDER-011] 송장이 이미 있는 주문과 종결 주문에는 처리 버튼을 두지 않는다', async () => {
    renderOrders()

    // 서버에 송장 정정 경로가 없다(재등록 409/50302) — 목업 시절의 '송장 수정' 버튼을 지웠다.
    const shipping = await rowOf(SHIPPING.orderId)
    expect(within(shipping).queryByRole('button', { name: /발송 처리/ })).not.toBeInTheDocument()
    for (const order of [DELIVERED, CANCELLED]) {
      const row = await rowOf(order.orderId)
      expect(within(row).getByText('처리 완료')).toBeInTheDocument()
    }
  })

  it('[AC-SORDER-012] 서버가 상태 전이를 거절하면 서버 코드에 맞는 문구를 띄운다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${SELLER_ORDERS_URL}/:orderPublicId/accept`, () =>
        HttpResponse.json(
          { errorCode: 50004, message: '결제완료 상태의 주문만 발주 확인할 수 있습니다.' },
          { status: 409 },
        ),
      ),
    )
    renderOrders()

    const row = await rowOf(NEW_ORDER.orderId)
    await user.click(within(row).getByRole('button', { name: `주문 ${NEW_ORDER.orderId} 발주 확인` }))
    await screen.findByText('발주를 확인할까요?')
    await user.click(screen.getByRole('button', { name: '발주 확인' }))

    expect(
      await screen.findByText('결제완료 상태의 주문만 발주 확인할 수 있어요. 목록을 새로고침해 주세요.'),
    ).toBeInTheDocument()
  })
})

describe('셀러 주문 상세 Drawer', () => {
  it('[AC-SORDER-013] 행을 누르면 품목·배송·금액을 서버 상세로 그린다', async () => {
    const user = userEvent.setup()
    seedSellerOrders([
      {
        order: SHIPPING,
        items: [
          makeSellerOrderLineWire({
            productName: '고양이 자동 급식기 스마트 5L',
            optionName: '화이트',
            quantity: 2,
            unitPrice: 29000,
            discountAllocatedAmount: 2000,
          }),
        ],
      },
    ])
    renderOrders()

    await user.click(await rowOf(SHIPPING.orderId))

    expect(await screen.findByText('고양이 자동 급식기 스마트 5L')).toBeInTheDocument()
    expect(screen.getByText('화이트 / 2개')).toBeInTheDocument()
    expect(screen.getByText('58,000원')).toBeInTheDocument()
    expect(screen.getByText('할인 -2,000원')).toBeInTheDocument()
    expect(screen.getByText('601234567890')).toBeInTheDocument()
    // 택배사 추적 문구는 자유 문자열이라 고정 어휘로 접지 않고 그대로 띄운다.
    expect(screen.getByText('간선상차')).toBeInTheDocument()
    expect(screen.getByText('(06236) 서울 강남구 테헤란로 1 101동 1001호')).toBeInTheDocument()
  })

  it('[AC-SORDER-014] 진행 중 클레임은 목록 보조 텍스트와 상세 안내로 드러낸다', async () => {
    const user = userEvent.setup()
    renderOrders()

    const row = await rowOf(CLAIMED.orderId)
    expect(within(row).getByText('반품 회수중')).toBeInTheDocument()

    await user.click(row)

    expect(await screen.findByText(/반품 요청이 진행 중이에요/)).toBeInTheDocument()
  })

  it('[AC-SORDER-015] 상세 조회 실패는 빈 Drawer가 아니라 오류 안내로 보여준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${SELLER_ORDERS_URL}/:orderPublicId`, () =>
        HttpResponse.json({ errorCode: 50000, message: '주문을 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderOrders()

    await user.click(await rowOf(NEW_ORDER.orderId))

    expect(
      await screen.findByText('주문을 찾을 수 없어요. 목록을 새로고침해 주세요.'),
    ).toBeInTheDocument()
  })
})

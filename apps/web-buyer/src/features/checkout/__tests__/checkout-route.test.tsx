import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { CART_QUERY_KEY, resetCartSelection, setCartItemSelected } from '@/shared/cart'
import {
  ensureOrderAttempt,
  markOrderAttemptCreated,
  readOrderAttempt,
  resetOrderAttempt,
  type OrderSnapshot,
} from '@/shared/order'
import { POINTS_QUERY_KEY } from '@/shared/points'
import {
  CART_URL,
  DELIVERY_ADDRESSES_URL,
  ORDER_GROUPS_URL,
  POINTS_URL,
  currentCart,
  currentCreatedOrderGroups,
  makeCartRow,
  paymentCallCounts,
  seedCart,
  seedDeliveryAddresses,
  seedPaymentState,
  seedPointBalance,
  server,
  type DeliveryAddressRow,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 주문서(/checkout) ↔ 서버 장바구니(GET /carts) + 주문그룹 생성(POST /order-groups, Idempotency-Key) +
// 결제 시작(prepare → 포트원 SDK) 연동. 서버는 MSW 상태형 핸들러, SDK는 모듈 모킹.
const sdk = vi.hoisted(() => ({ requestPayment: vi.fn() }))
vi.mock('@portone/browser-sdk/v2', () => ({ requestPayment: sdk.requestPayment }))

function renderAt(entries: string[]) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: entries }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...utils, router, queryClient }
}

// 결제 버튼을 열려면 기본 배송지가 필요하다(배송지 없으면 canPay가 false).
const DEFAULT_ADDRESS: DeliveryAddressRow = {
  addressId: 1,
  label: '집',
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '06236',
  baseAddress: '서울 강남구 테헤란로 1',
  detailAddress: '101동 1001호',
  isDefault: true,
}

interface RecordedCreate {
  key: string | null
  body: {
    cartItemIds: number[]
    deliveryAddressId: number
    usedPoint: number
    expectedFinalAmount: number
  }
}

// POST /order-groups 헤더·본문을 기록만 하고 상태형 핸들러로 넘긴다(아무것도 반환하지 않으면 fall-through).
function recordCreateRequests() {
  const requests: RecordedCreate[] = []
  server.use(
    http.post(ORDER_GROUPS_URL, async ({ request }) => {
      requests.push({
        key: request.headers.get('Idempotency-Key'),
        body: (await request.clone().json()) as RecordedCreate['body'],
      })
      return undefined
    }),
  )
  return requests
}

const sdkLaunched = () =>
  sdk.requestPayment.mockImplementation((req: { paymentId: string }) =>
    Promise.resolve({ transactionType: 'PAYMENT', txId: 'tx-1', paymentId: req.paymentId }),
  )
const sdkCancelled = () =>
  sdk.requestPayment.mockResolvedValue({
    transactionType: 'PAYMENT',
    txId: 'tx-1',
    paymentId: 'x',
    code: 'FAILURE_TYPE_PG',
    message: '사용자가 결제를 취소하셨습니다',
  })

async function agreeAndPay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /결제에 동의해요/ }))
  await user.click(screen.getByRole('button', { name: /결제하기/ }))
}

const LIVE_OG = 'OG-LIVE-0000000000000000001'
const LIVE_SNAPSHOT: OrderSnapshot = {
  method: 'card',
  orderName: '리얼 프리미엄 자동 급식기',
  cartItemIds: [1],
  lineCount: 1,
  totalProductAmount: 64000,
  totalShippingFee: 0,
  usedPoint: 3000,
  finalPaymentAmount: 61000,
}

// 다른 세션에서 만들어 둔 만료 전 주문그룹(결제 대기)을 sessionStorage에 심는다 — 주문서 진입이 재진입 모드가 된다.
function seedLiveAttempt(snapshot: Partial<OrderSnapshot> = {}) {
  const attempt = ensureOrderAttempt('seeded-fingerprint')
  markOrderAttemptCreated(attempt.attemptId, {
    orderGroupId: LIVE_OG,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    snapshot: { ...LIVE_SNAPSHOT, ...snapshot },
  })
  seedPaymentState({ [LIVE_OG]: { finalPaymentAmount: 61000, usedPoint: 3000 } })
}

beforeEach(() => {
  sdk.requestPayment.mockReset()
  resetCartSelection()
  resetOrderAttempt()
})

describe('/checkout 배송지 없음 상태', () => {
  beforeEach(() => {
    seedCart([makeCartRow({ cartItemId: 1 })])
    seedDeliveryAddresses([])
  })

  it('[AC-CHECKOUT-005] 배송지가 없으면 배송지 추가 CTA를 보여주고 결제 버튼을 막는다', async () => {
    renderAt(['/checkout'])

    expect(
      await screen.findByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배송지 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-007] 배송지 조회가 실패하면 "없음"이 아니라 조회 실패로 안내한다', async () => {
    server.use(http.get(DELIVERY_ADDRESSES_URL, () => HttpResponse.error()))
    renderAt(['/checkout'])

    expect(await screen.findByText('배송지를 불러오지 못했어요.')).toBeInTheDocument()
    expect(
      screen.queryByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.'),
    ).toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-006] 배송지 추가 CTA는 배송지 관리 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt(['/checkout'])

    await user.click(await screen.findByRole('button', { name: '배송지 추가' }))
    expect(await screen.findByText('배송지 관리')).toBeInTheDocument()
  })
})

describe('/checkout 서버 장바구니 기준 주문 요약', () => {
  beforeEach(() => {
    seedPointBalance(0)
    seedDeliveryAddresses([DEFAULT_ADDRESS])
  })

  it('[AC-CHECKOUT-020] 선택된 주문 가능 라인만 셀러별로 요약하고 배송비는 셀러별 임계로 계산한다', async () => {
    // 리얼상점 64,000(임계 50,000 → 무료), 멍멍마트 10,000(임계 없음 → 기본 2,500). 총 76,500.
    seedCart([
      makeCartRow({ cartItemId: 1 }),
      makeCartRow({
        cartItemId: 2,
        productName: '스크래쳐 하우스',
        price: 10000,
        originalPrice: 10000,
        sellerId: 2,
        storeName: '멍멍마트',
        baseShippingFee: 2500,
        freeShippingThreshold: null,
      }),
    ])
    renderAt(['/checkout'])

    expect(await screen.findByText('주문 상품 / 리얼상점')).toBeInTheDocument()
    expect(screen.getByText('주문 상품 / 멍멍마트')).toBeInTheDocument()
    expect(screen.getByText('74,000원')).toBeInTheDocument()
    expect(screen.getByText('2,500원')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '76,500원 결제하기' })).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-021] 선택 해제한 라인은 요약·금액에서 빠지고 그 셀러의 배송비도 사라진다', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1 }),
      makeCartRow({
        cartItemId: 2,
        productName: '스크래쳐 하우스',
        price: 10000,
        originalPrice: 10000,
        sellerId: 2,
        storeName: '멍멍마트',
        baseShippingFee: 2500,
        freeShippingThreshold: null,
      }),
    ])
    setCartItemSelected(2, false)
    renderAt(['/checkout'])

    expect(await screen.findByText('주문 상품 / 리얼상점')).toBeInTheDocument()
    expect(screen.queryByText('주문 상품 / 멍멍마트')).toBeNull()
    expect(screen.queryByText('스크래쳐 하우스')).toBeNull()
    expect(screen.getByText('무료')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '64,000원 결제하기' })).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-011] 품절 라인은 체크돼 있어도 요약·주문 본문에서 빠지고 결제 후 장바구니에 남는다', async () => {
    const user = userEvent.setup()
    seedCart([
      makeCartRow({ cartItemId: 1 }),
      makeCartRow({
        cartItemId: 2,
        optionCombinationId: 3,
        selectedOptions: '한정형',
        productName: '품절 한정판 급식기',
        itemStatus: 'OUT_OF_STOCK',
        remainingStock: 0,
      }),
    ])
    const requests = recordCreateRequests()
    sdkLaunched()
    renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    expect(screen.queryByText('품절 한정판 급식기')).toBeNull()

    await agreeAndPay(user)

    expect(
      await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.body.cartItemIds).toEqual([1])
    // 주문되지 않은 품절 라인은 서버가 지우지 않는다.
    expect(currentCart().map(r => r.cartItemId)).toEqual([2])
  })

  it('[AC-CHECKOUT-022] 주문할 상품이 없으면 빈 상태를 보여주고 장바구니로 보낸다', async () => {
    const user = userEvent.setup()
    seedCart([])
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText('주문할 상품이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /결제하기/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: '장바구니로' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
  })

  it('[AC-CHECKOUT-023] 장바구니 조회가 실패하면 빈 상태가 아니라 다시 시도 화면을 보여준다', async () => {
    seedCart([makeCartRow({ cartItemId: 1 })])
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt(['/checkout'])

    expect(await screen.findByText('장바구니를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText('주문할 상품이 없어요')).toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})

describe('/checkout 주문그룹 생성 → 결제 시작', () => {
  beforeEach(() => {
    seedCart([makeCartRow({ cartItemId: 1 })])
    seedPointBalance(0)
    seedDeliveryAddresses([DEFAULT_ADDRESS])
  })

  it('[AC-CHECKOUT-024] 결제하기는 Idempotency-Key 헤더와 주문 본문으로 주문그룹을 만들고 결제창 뒤 결과 화면으로 replace 이동한다', async () => {
    const user = userEvent.setup()
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/cart', '/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    const [created] = currentCreatedOrderGroups()
    expect(created).toBeDefined()
    expect(router.state.location.search).toEqual({
      orderGroupId: created?.orderGroupId,
      method: 'kakaopay',
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.key).toBeTruthy()
    expect(requests[0]?.key?.trim().length).toBeGreaterThan(0)
    expect(requests[0]?.key?.length).toBeLessThanOrEqual(100)
    expect(requests[0]?.body).toEqual({
      cartItemIds: [1],
      deliveryAddressId: 1,
      usedPoint: 0,
      expectedFinalAmount: 64000,
    })
    // 결제창에는 주문명(대표상품명)과 prepare 응답의 금액이 간다.
    expect(sdk.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: created?.orderGroupId,
        orderName: '리얼 프리미엄 자동 급식기',
        totalAmount: 64000,
        easyPay: { easyPayProvider: 'KAKAOPAY' },
      }),
    )
    // 결과 화면이 complete로 PAID를 확인하고, 주문서는 히스토리에 남지 않는다(replace).
    expect(
      await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    // 결제가 끝난 주문그룹의 시도 기록은 결과 화면이 지운다(장바구니 배너·재진입 모드 방지).
    expect(readOrderAttempt()).toBeNull()
    router.history.back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
  })

  it('[AC-CHECKOUT-025] 결제수단·적립금은 본문과 결제창에 반영된다(토스페이 + 전액사용)', async () => {
    const user = userEvent.setup()
    seedPointBalance(1200)
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText('보유 1,200원')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '전액사용' }))
    await user.click(screen.getByRole('radio', { name: '토스페이' }))
    expect(screen.getByRole('button', { name: '62,800원 결제하기' })).toBeInTheDocument()
    await agreeAndPay(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(requests[0]?.body).toEqual({
      cartItemIds: [1],
      deliveryAddressId: 1,
      usedPoint: 1200,
      expectedFinalAmount: 62800,
    })
    expect(router.state.location.search).toMatchObject({ method: 'tosspay' })
    expect(sdk.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 62800, easyPay: { easyPayProvider: 'TOSSPAY' } }),
    )
  })

  it('[AC-CHECKOUT-026] 주문 생성이 통신 오류로 실패한 뒤 같은 본문으로 재시도하면 같은 Idempotency-Key를 보낸다', async () => {
    const user = userEvent.setup()
    // 기록 핸들러는 가장 앞에 있어야 하므로(server.use는 앞에 끼운다) 1회 실패 핸들러 뒤에 건다.
    server.use(http.post(ORDER_GROUPS_URL, () => HttpResponse.error(), { once: true }))
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)

    expect(
      await screen.findByText('주문을 만들지 못했어요. 잠시 후 다시 시도해 주세요'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')

    await user.click(screen.getByRole('button', { name: /결제하기/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(requests).toHaveLength(2)
    expect(requests[1]?.key).toBe(requests[0]?.key)
    expect(currentCreatedOrderGroups()).toHaveLength(1)
  })

  it('[AC-CHECKOUT-027] 본문(적립금)이 바뀌면 새 Idempotency-Key로 보낸다', async () => {
    const user = userEvent.setup()
    seedPointBalance(50000)
    // 기록 핸들러는 가장 앞에 있어야 하므로(server.use는 앞에 끼운다) 1회 실패 핸들러 뒤에 건다.
    server.use(http.post(ORDER_GROUPS_URL, () => HttpResponse.error(), { once: true }))
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await agreeAndPay(user)
    expect(
      await screen.findByText('주문을 만들지 못했어요. 잠시 후 다시 시도해 주세요'),
    ).toBeInTheDocument()

    await user.type(input, '1000')
    await user.click(screen.getByRole('button', { name: '63,000원 결제하기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(requests).toHaveLength(2)
    expect(requests[0]?.body.usedPoint).toBe(0)
    expect(requests[1]?.body.usedPoint).toBe(1000)
    expect(requests[1]?.key).not.toBe(requests[0]?.key)
  })

  it('[AC-CHECKOUT-028] 결제창을 취소하면 주문서에 남아 안내하고, 다시 결제하면 새 주문 없이 같은 주문그룹으로 재진입한다', async () => {
    const user = userEvent.setup()
    sdkCancelled()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)

    expect(await screen.findByText('결제를 취소했어요. 다시 시도할 수 있어요')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')
    const [created] = currentCreatedOrderGroups()
    expect(created).toBeDefined()
    expect(paymentCallCounts(created!.orderGroupId).prepare).toBe(1)

    sdkLaunched()
    await user.click(screen.getByRole('button', { name: /결제하기/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(router.state.location.search).toMatchObject({ orderGroupId: created!.orderGroupId })
    expect(currentCreatedOrderGroups()).toHaveLength(1)
    expect(paymentCallCounts(created!.orderGroupId).prepare).toBe(2)
  })

  it('[AC-CHECKOUT-029] 50106(금액 불일치)이면 주문을 만들지 않고 장바구니를 다시 읽어 금액을 갱신하며 안내한다', async () => {
    const user = userEvent.setup()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByRole('button', { name: '64,000원 결제하기' })).toBeInTheDocument()
    // 화면이 64,000원을 보여주는 사이 서버 가격이 바뀐다 → 서버 계산(60,000)과 어긋나 409 50106.
    seedCart([makeCartRow({ cartItemId: 1, price: 60000 })])
    await agreeAndPay(user)

    expect(
      await screen.findByText(
        '주문 금액이 바뀌어 다시 계산했어요. 금액을 확인하고 다시 결제해 주세요',
      ),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')
    expect(currentCreatedOrderGroups()).toHaveLength(0)
    expect(sdk.requestPayment).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: '60,000원 결제하기' })).toBeInTheDocument()
    expect(readOrderAttempt()).toBeNull()
  })

  it('[AC-CHECKOUT-030] 50104(주문 불가 상품)이면 장바구니로 돌려보낸다', async () => {
    const user = userEvent.setup()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    seedCart([makeCartRow({ cartItemId: 1, itemStatus: 'OUT_OF_STOCK', remainingStock: 0 })])
    await agreeAndPay(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
    expect(currentCreatedOrderGroups()).toHaveLength(0)
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-CHECKOUT-031] prepare가 60006(이미 결제)이면 결과 화면으로 보내 PAID를 확인한다', async () => {
    const user = userEvent.setup()
    seedPaymentState({ '*': { prepare: { error: { status: 409, errorCode: 60006 } } } })
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(sdk.requestPayment).not.toHaveBeenCalled()
    expect(
      await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-032] prepare가 60009(만료)면 시도를 지우고 안내하며, 다시 결제하면 새 키로 새 주문그룹을 만든다', async () => {
    const user = userEvent.setup()
    seedPaymentState({ '*': { prepare: { error: { status: 409, errorCode: 60009 } } } })
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)

    expect(
      await screen.findByText('결제 가능 시간이 지났어요. 결제하기를 다시 눌러 새로 주문해 주세요'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')
    expect(readOrderAttempt()).toBeNull()

    seedPaymentState()
    await user.click(screen.getByRole('button', { name: /결제하기/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(requests).toHaveLength(2)
    expect(requests[1]?.key).not.toBe(requests[0]?.key)
    expect(currentCreatedOrderGroups()).toHaveLength(2)
  })

  it('[AC-CHECKOUT-033] 결제 진행 중에는 결제 버튼이 잠겨 연타해도 주문그룹을 한 번만 만든다', async () => {
    const user = userEvent.setup()
    const requests = recordCreateRequests()
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    sdk.requestPayment.mockImplementation(async (req: { paymentId: string }) => {
      await held
      return { transactionType: 'PAYMENT', txId: 'tx-1', paymentId: req.paymentId }
    })
    const { router } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /결제하기/ }))

    await act(async () => {
      release()
      await Promise.resolve()
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(requests).toHaveLength(1)
    expect(sdk.requestPayment).toHaveBeenCalledTimes(1)
  })
})

describe('/checkout 적립금 사용 한도(서버 잔액)', () => {
  beforeEach(() => {
    // 리얼상점 급식기 64,000원(무료배송 기준 50,000원 이상 → 배송비 0) → 결제 가능액 64,000원.
    seedCart([makeCartRow({ cartItemId: 1 })])
    seedDeliveryAddresses([])
    seedPointBalance(0)
  })

  it('[AC-POINT-CHECKOUT-004] 사용 한도는 서버 잔액이다(잔액 < 주문금액이면 최대 = 잔액)', async () => {
    // 잔액은 최소 사용액(1,000) 이상이어야 "잔액이 상한"을 볼 수 있다 — 700원은 서버가 아예
    // 거절하는 구간이라 최대가 0으로 접히므로(AC-POINT-CHECKOUT-006) 1,200원으로 세운다.
    seedPointBalance(1200)
    renderAt(['/checkout'])

    expect(await screen.findByText('보유 1,200원')).toBeInTheDocument()
    expect(await screen.findByText('최대 1,200원까지 사용할 수 있어요')).toBeInTheDocument()
  })

  it('[AC-POINT-CHECKOUT-006] 잔액이 최소 사용액 미만이면 쓸 수 없다고 안내하고 입력을 막는다', async () => {
    // BE OrderGroup.create는 1~999원을 400/50103(POINT_BELOW_MINIMUM_USAGE)로 거절한다.
    seedPointBalance(900)
    renderAt(['/checkout'])

    expect(await screen.findByText('보유 900원')).toBeInTheDocument()
    expect(screen.getByText('적립금은 1,000원부터 사용할 수 있어요')).toBeInTheDocument()
    expect(screen.queryByText(/최대 .*까지 사용할 수 있어요/)).toBeNull()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
  })

  it('[AC-POINT-CHECKOUT-005] 잔액 조회 실패는 잔액 부족과 갈라 안내하고 사용 가능 0으로 강하한다', async () => {
    seedPointBalance(700)
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    renderAt(['/checkout'])

    expect(
      await screen.findByText('적립금을 불러오지 못해 이 주문에는 사용할 수 없어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('보유 —')).toBeInTheDocument()
    expect(screen.queryByText('적립금은 1,000원부터 사용할 수 있어요')).toBeNull()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-013] 2,500원처럼 1,000원대 밖 금액도 타이핑으로 입력할 수 있다', async () => {
    // 회귀 방지: onChange가 하한(1,000원)을 강제하면 `2`가 즉시 1000이 되고 `5`가 10005가 된다.
    const user = userEvent.setup()
    seedPointBalance(50000)
    renderAt(['/checkout'])

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())

    await user.type(input, '2')
    expect(input).toHaveValue('2')
    await user.type(input, '5')
    expect(input).toHaveValue('25')
    await user.type(input, '00')
    expect(input).toHaveValue('2500')

    await user.tab()
    expect(input).toHaveValue('2500')
    expect(screen.getByText('-2,500원')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-014] 하한 미만 입력은 포커스 이탈 시 0으로 내리고 사유를 안내한다', async () => {
    const user = userEvent.setup()
    seedPointBalance(50000)
    renderAt(['/checkout'])

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())

    await user.type(input, '250')
    expect(input).toHaveValue('250')
    expect(
      screen.getByText('적립금은 1,000원부터 쓸 수 있어 그보다 적은 금액은 적용되지 않아요'),
    ).toBeInTheDocument()
    expect(screen.queryByText('적립금 사용')).toBeNull()

    await user.tab()
    expect(input).toHaveValue('0')
    expect(screen.getByText('최대 50,000원까지 사용할 수 있어요')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-015] 사용 상한이 줄면 입력값도 함께 내려간다', async () => {
    const user = userEvent.setup()
    seedPointBalance(50000)
    const { queryClient } = renderAt(['/checkout'])

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '20000')
    expect(input).toHaveValue('20000')

    seedPointBalance(1500)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: POINTS_QUERY_KEY })
    })

    await waitFor(() => expect(input).toHaveValue('1500'))
    expect(screen.getByText('최대 1,500원까지 사용할 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('-1,500원')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-018] 재조회가 실패하면 직전 잔액으로 계속 차감하지 않는다', async () => {
    const user = userEvent.setup()
    seedPointBalance(50000)
    const { queryClient } = renderAt(['/checkout'])

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '20000')
    expect(screen.getByText('-20,000원')).toBeInTheDocument()

    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: POINTS_QUERY_KEY })
    })

    await waitFor(() =>
      expect(
        screen.getByText('적립금을 불러오지 못해 이 주문에는 사용할 수 없어요'),
      ).toBeInTheDocument(),
    )
    expect(input).toHaveValue('0')
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
    expect(screen.queryByText('-20,000원')).toBeNull()
  })
})

describe('/checkout 진행 중인 주문(만료 전 주문그룹) 재진입 모드', () => {
  beforeEach(() => {
    // live 장바구니는 60,000원으로 바뀌어 있다 — 스냅샷(61,000원·카드)과 다르다.
    seedCart([makeCartRow({ cartItemId: 1, price: 60000 })])
    seedPointBalance(0)
    seedDeliveryAddresses([DEFAULT_ADDRESS])
  })

  it('[AC-CHECKOUT-034] 만료 전 주문그룹이 있으면 live 장바구니로 다시 계산하지 않고 스냅샷 금액·수단을 고정해 보여준다', async () => {
    seedLiveAttempt()
    renderAt(['/checkout'])

    expect(await screen.findByText('진행 중인 주문이 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '61,000원 이어서 결제하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새 주문으로 시작' })).toBeInTheDocument()
    expect(screen.getByText('64,000원')).toBeInTheDocument()
    expect(screen.getByText('-3,000원')).toBeInTheDocument()
    expect(screen.queryByText('60,000원')).toBeNull()
    expect(screen.queryByRole('button', { name: '60,000원 결제하기' })).toBeNull()
    // 수단은 처음 고른 카드로 고정 — 라디오 전부 비활성.
    const card = screen.getByRole('radio', { name: '신용 / 체크카드' })
    expect(card).toBeChecked()
    expect(card).toBeDisabled()
    expect(screen.getByRole('radio', { name: '카카오페이' })).toBeDisabled()
    expect(screen.getByText('진행 중인 주문은 처음 선택한 수단으로 결제돼요')).toBeInTheDocument()
    // 이미 동의한 주문이라 동의 체크박스·적립금 입력은 다시 받지 않는다.
    expect(screen.queryByRole('checkbox', { name: /결제에 동의해요/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('[AC-CHECKOUT-035] 이어서 결제하기는 새 주문 없이 저장된 그룹·수단으로 prepare → 결제창 → 결과 화면으로 간다', async () => {
    const user = userEvent.setup()
    seedLiveAttempt()
    const requests = recordCreateRequests()
    sdkLaunched()
    const { router } = renderAt(['/checkout'])

    await user.click(await screen.findByRole('button', { name: '61,000원 이어서 결제하기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(router.state.location.search).toEqual({ orderGroupId: LIVE_OG, method: 'card' })
    expect(requests).toHaveLength(0)
    expect(currentCreatedOrderGroups()).toHaveLength(0)
    expect(paymentCallCounts(LIVE_OG).prepare).toBe(1)
    expect(sdk.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: LIVE_OG,
        orderName: '리얼 프리미엄 자동 급식기',
        totalAmount: 61000,
        payMethod: 'CARD',
      }),
    )
    expect(
      await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-036] 이어서 결제하기가 60009(만료)면 시도를 지우고 live 장바구니 기준 일반 모드로 돌아가 안내한다', async () => {
    const user = userEvent.setup()
    seedLiveAttempt()
    seedPaymentState({ [LIVE_OG]: { prepare: { error: { status: 409, errorCode: 60009 } } } })
    renderAt(['/checkout'])

    await user.click(await screen.findByRole('button', { name: '61,000원 이어서 결제하기' }))

    expect(
      await screen.findByText('결제 가능 시간이 지났어요. 결제하기를 다시 눌러 새로 주문해 주세요'),
    ).toBeInTheDocument()
    expect(readOrderAttempt()).toBeNull()
    expect(screen.queryByText('진행 중인 주문이 있어요')).toBeNull()
    expect(await screen.findByRole('button', { name: '60,000원 결제하기' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '카카오페이' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /결제에 동의해요/ })).toBeInTheDocument()
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-CHECKOUT-037] 이어서 결제하기가 60006(이미 결제)이면 시도를 지우고 결과 화면으로 보낸다', async () => {
    const user = userEvent.setup()
    seedLiveAttempt()
    seedPaymentState({
      [LIVE_OG]: {
        prepare: { error: { status: 409, errorCode: 60006 } },
        finalPaymentAmount: 61000,
        usedPoint: 3000,
      },
    })
    const { router } = renderAt(['/checkout'])

    await user.click(await screen.findByRole('button', { name: '61,000원 이어서 결제하기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(readOrderAttempt()).toBeNull()
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-CHECKOUT-038] 새 주문으로 시작은 재고가 만료까지 묶여 있음을 알리고, 시도를 지워 일반 모드로 돌아간다', async () => {
    const user = userEvent.setup()
    seedLiveAttempt()
    const requests = recordCreateRequests()
    renderAt(['/checkout'])

    expect(
      await screen.findByText(
        '새 주문으로 시작해도 지금 주문이 확보한 재고는 만료(최대 10분)까지 풀리지 않아요',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '새 주문으로 시작' }))

    expect(await screen.findByRole('button', { name: '60,000원 결제하기' })).toBeInTheDocument()
    expect(screen.queryByText('진행 중인 주문이 있어요')).toBeNull()
    expect(readOrderAttempt()).toBeNull()
    expect(requests).toHaveLength(0)
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-CHECKOUT-039] 결제창 취소 뒤 장바구니가 바뀌어도(재고 차감으로 품절 표시) 새 주문그룹을 만들지 않고 같은 그룹으로 이어서 결제한다', async () => {
    const user = userEvent.setup()
    seedCart([makeCartRow({ cartItemId: 1 })])
    const requests = recordCreateRequests()
    sdkCancelled()
    const { router, queryClient } = renderAt(['/checkout'])

    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    await agreeAndPay(user)
    expect(await screen.findByText('결제를 취소했어요. 다시 시도할 수 있어요')).toBeInTheDocument()
    const [created] = currentCreatedOrderGroups()
    expect(created).toBeDefined()
    // 그룹이 생기면 주문서는 진행 중인 주문 모드가 된다 — 스냅샷 금액 그대로.
    expect(screen.getByText('진행 중인 주문이 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '64,000원 이어서 결제하기' })).toBeInTheDocument()

    // 서버가 주문분 재고를 차감해 같은 라인이 품절·0원 잔여로 내려와도 스냅샷은 흔들리지 않는다.
    seedCart([makeCartRow({ cartItemId: 1, itemStatus: 'OUT_OF_STOCK', remainingStock: 0 })])
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    })
    expect(screen.getByRole('button', { name: '64,000원 이어서 결제하기' })).toBeInTheDocument()
    expect(screen.queryByText('주문할 상품이 없어요')).toBeNull()

    sdkLaunched()
    await user.click(screen.getByRole('button', { name: '64,000원 이어서 결제하기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/result'))
    expect(router.state.location.search).toEqual({
      orderGroupId: created!.orderGroupId,
      method: 'kakaopay',
    })
    expect(requests).toHaveLength(1)
    expect(currentCreatedOrderGroups()).toHaveLength(1)
    expect(paymentCallCounts(created!.orderGroupId).prepare).toBe(2)
  })

  it('[AC-CHECKOUT-040] 스냅샷 라인이 장바구니에 하나도 없으면(결제 완료로 서버가 지움) 시도를 버리고 일반 모드로 연다', async () => {
    seedLiveAttempt({ cartItemIds: [99] })
    renderAt(['/checkout'])

    expect(await screen.findByRole('button', { name: '60,000원 결제하기' })).toBeInTheDocument()
    expect(screen.queryByText('진행 중인 주문이 있어요')).toBeNull()
    expect(readOrderAttempt()).toBeNull()
  })
})

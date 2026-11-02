import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken } from '@aechak/api'
import { resetCartSelection, setCartItemSelected } from '@/shared/cart'
import { logout, resetAuth } from '@/shared/auth'
import {
  ensureOrderAttempt,
  markOrderAttemptCreated,
  readOrderAttempt,
  resetOrderAttempt,
} from '@/shared/order'
import {
  CART_ITEM_URL,
  CART_ITEMS_URL,
  CART_URL,
  WEB_REFRESH_URL,
  currentCart,
  makeCartRow,
  seedCart,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const scratcherRow = () =>
  makeCartRow({
    cartItemId: 2,
    sellerId: 2,
    storeName: '멍멍마트',
    optionCombinationId: 90,
    productId: 'p-scratcher-x',
    productName: '스크래쳐 하우스 2종 세트',
    selectedOptions: '기본',
    originalPrice: 29000,
    price: 29000,
    discountRate: null,
    itemStatus: 'OUT_OF_STOCK',
    remainingStock: 0,
  })

// 서버 장바구니 시드 — 냥이상점 급식기(주문 가능·선택) + 멍멍마트 스크래쳐(품절·선택 해제).
// 선택 상태는 클라이언트 스토어라 시드와 별개로 세운다(새 라인 기본 선택 → 품절만 해제).
function seedTwoSellers() {
  seedCart([makeCartRow({ cartItemId: 1, storeName: '냥이상점', sellerId: 1 }), scratcherRow()])
  resetCartSelection()
  setCartItemSelected(2, false)
}

// 결제를 기다리는(만료 전) 주문그룹 기록 — 장바구니 상단 배너의 조건.
function seedLiveAttempt(cartItemIds: number[]) {
  const attempt = ensureOrderAttempt('seeded-fingerprint')
  markOrderAttemptCreated(attempt.attemptId, {
    orderGroupId: 'OG-LIVE-0000000000000000001',
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    snapshot: {
      method: 'kakaopay',
      orderName: '리얼 프리미엄 자동 급식기',
      cartItemIds,
      lineCount: cartItemIds.length,
      totalProductAmount: 64000,
      totalShippingFee: 0,
      usedPoint: 0,
      finalPaymentAmount: 64000,
    },
  })
}

// PATCH 본문을 기록만 하고 다음 핸들러(상태형)로 넘긴다(핸들러가 아무것도 반환하지 않으면 fall-through).
function recordPatchBodies(options?: { holdFirst?: Promise<void> }) {
  const bodies: Array<{ quantity?: number }> = []
  server.use(
    http.patch(CART_ITEM_URL, async ({ request }) => {
      const body = (await request.clone().json()) as { quantity?: number }
      bodies.push(body)
      if (bodies.length === 1 && options?.holdFirst) await options.holdFirst
      return undefined
    }),
  )
  return bodies
}

describe('/cart', () => {
  beforeEach(() => {
    seedTwoSellers()
    resetAuth()
    // 회원 세션(메모리 access 보유)이 전제인 화면이다 — 토큰이 세션의 정본이라 이걸로 로그인시킨다.
    setAccessToken('member-token')
    resetOrderAttempt()
  })

  it('[AC-CART-ROUTE-001] 서버 장바구니를 셀러 그룹으로 보여주고 품절 상품을 표기한다', async () => {
    renderAt('/cart')
    expect(await screen.findByText('냥이상점')).toBeInTheDocument()
    expect(screen.getByText('멍멍마트')).toBeInTheDocument()
    expect(screen.getByText('결제예정금액')).toBeInTheDocument()
    expect(screen.getByText('품절')).toBeInTheDocument()
    // 선택된 라인 1개 → 주문하기 (1)
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-005] 결제를 기다리는 주문이 있으면 배너를 띄우고 이어서 결제하기가 주문서로 보낸다', async () => {
    const user = userEvent.setup()
    // 주문분 재고가 차감돼 라인이 재고 초과로 보여 주문하기가 막힌 상황 — 배너가 유일한 출구다.
    seedCart([
      makeCartRow({
        cartItemId: 1,
        storeName: '냥이상점',
        sellerId: 1,
        quantity: 2,
        remainingStock: 1,
      }),
    ])
    resetCartSelection()
    seedLiveAttempt([1])
    const router = renderAt('/cart')

    expect(await screen.findByText('결제를 기다리는 주문이 있어요')).toBeInTheDocument()
    expect(screen.getByText('남은 재고가 1개예요. 수량을 줄여주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /주문하기/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '이어서 결제하기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout'))
    expect(await screen.findByText('진행 중인 주문이 있어요')).toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-006] 주문 기록이 없거나 스냅샷 라인이 장바구니에 남아 있지 않으면 배너를 띄우지 않고 기록을 지운다', async () => {
    renderAt('/cart')
    await screen.findByText('냥이상점')
    expect(screen.queryByText('결제를 기다리는 주문이 있어요')).toBeNull()
  })

  it('[AC-CART-ROUTE-007] 스냅샷 라인이 장바구니에서 모두 사라졌으면(결제 완료) 배너 없이 기록을 지운다', async () => {
    seedLiveAttempt([99])
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await waitFor(() => expect(readOrderAttempt()).toBeNull())
    expect(screen.queryByText('결제를 기다리는 주문이 있어요')).toBeNull()
  })

  it('[AC-CART-EMPTY-001] 빈 장바구니는 빈 상태와 쇼핑하러 가기를 보여준다', async () => {
    seedCart()
    renderAt('/cart')
    expect(await screen.findByText('장바구니가 비어 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '쇼핑하러 가기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /주문하기/ })).not.toBeInTheDocument()
  })

  it('[AC-CART-PRICE-001] 할인 중인 라인은 주문 가능·불가 양쪽에서 원가를 취소선으로 덧붙이고 할인율 %는 두지 않는다', async () => {
    // 서버가 originalPrice(정가+옵션 추가금)를 직접 내려준다 — 화면이 price/discountRate로 역산하지 않는다.
    seedCart([
      makeCartRow({ cartItemId: 1, optionCombinationId: 1 }), // 주문 가능, 89,000 → 64,000
      makeCartRow({
        cartItemId: 2,
        optionCombinationId: 2,
        productName: '할인 없는 상품',
        selectedOptions: '기본',
        originalPrice: 30000,
        price: 30000,
        discountRate: null,
      }),
      makeCartRow({
        cartItemId: 3,
        optionCombinationId: 3,
        productName: '품절 할인 상품',
        selectedOptions: '기본',
        originalPrice: 50000,
        price: 40000,
        itemStatus: 'OUT_OF_STOCK',
        remainingStock: 0,
      }),
    ])
    resetCartSelection()
    renderAt('/cart')
    await screen.findByText('할인 없는 상품')

    // 주문 가능 라인 — 원가가 취소선으로 붙는다.
    expect((await screen.findByText('89,000원')).className).toContain('line-through')
    expect(screen.getAllByText('64,000원').length).toBeGreaterThan(0)

    // 주문 불가 라인도 같다 — 취소선을 흐린 색으로 그대로 보여준다.
    expect(screen.getByText('50,000원').className).toContain('line-through')
    expect(screen.getByText('40,000원')).toBeInTheDocument()

    // 할인이 없으면 같은 값을 취소선으로 한 번 더 그리지 않는다.
    expect(
      screen.getAllByText('30,000원').every(el => !el.className.includes('line-through')),
    ).toBe(true)

    // 할인율 뱃지는 두지 않는다 — 서버 discountRate는 상품 정가 기준이라 기준이 다르다.
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-002] 수량을 늘리면 서버 반영(PATCH 절대값) 후 결제예정금액이 갱신된다', async () => {
    const user = userEvent.setup()
    const bodies = recordPatchBodies()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드 급식기 64,000원 → +1 → 128,000원 (PATCH 후 재조회로 반영)
    await user.click(screen.getByRole('button', { name: '증가' }))
    expect(await screen.findAllByText('128,000원')).not.toHaveLength(0)
    await waitFor(() => expect(currentCart().find(r => r.cartItemId === 1)?.quantity).toBe(2))
    // 증감이 아니라 대입(절대값 2)으로 나간다.
    expect(bodies).toEqual([{ quantity: 2 }])
  })

  it('[AC-CART-QTY-SERIAL-001] 빠른 연타는 라인별로 직렬화돼 마지막 수량만 한 번 더 보내고 서버 최종값이 의도와 같다', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    const holdFirst = new Promise<void>(resolve => {
      release = resolve
    })
    const bodies = recordPatchBodies({ holdFirst })
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 첫 PATCH(2)가 서버에 머무는 동안 한 번 더 누른다 — 낙관적 값(2) 기준으로 3이 큐에 쌓인다.
    const increase = screen.getByRole('button', { name: '증가' })
    await user.click(increase)
    await waitFor(() => expect(bodies).toHaveLength(1))
    await user.click(increase)
    expect(bodies).toHaveLength(1)
    release()

    // 첫 요청이 끝난 뒤 마지막 희망값(3)만 1회 더 나가고, 서버 최종 수량은 3이다.
    await waitFor(() => expect(currentCart().find(r => r.cartItemId === 1)?.quantity).toBe(3))
    expect(bodies).toEqual([{ quantity: 2 }, { quantity: 3 }])
    expect(await screen.findAllByText('192,000원')).not.toHaveLength(0)
  })

  it('[AC-CART-ROUTE-003] 전체 선택을 모두 해제하면 주문하기 버튼이 비활성화된다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드는 급식기만 선택된 (1/2) 상태(품절 스크래쳐 해제) → 한 번 누르면 품절 포함 전체
    // 선택(2/2), 다시 누르면 전체 해제(0/2)라 주문하기가 (0)으로 비활성화된다.
    const selectAll = () => screen.getByRole('checkbox', { name: /전체 선택/ })
    await user.click(selectAll())
    await user.click(selectAll())
    expect(screen.getByRole('button', { name: '주문하기 (0)' })).toBeDisabled()
  })

  it('[AC-CART-SHIPPING-001] 선택 해제로 셀러 합계가 임계 미만이 되면 배송비가 붙고 무료배송 표기가 사라진다', async () => {
    const user = userEvent.setup()
    // 냥이상점(임계 50,000) 30,000원 두 라인 → 합 60,000 무료배송. 하나를 빼면 30,000 → 3,000원.
    seedCart([
      makeCartRow({
        cartItemId: 1,
        optionCombinationId: 1,
        productName: '사료 A',
        originalPrice: 30000,
        price: 30000,
        discountRate: null,
      }),
      makeCartRow({
        cartItemId: 2,
        optionCombinationId: 2,
        productName: '사료 B',
        originalPrice: 30000,
        price: 30000,
        discountRate: null,
      }),
    ])
    resetCartSelection()
    renderAt('/cart')
    await screen.findByText('사료 A')
    expect(screen.getByText('무료배송')).toBeInTheDocument()
    expect(screen.getByText('무료')).toBeInTheDocument()

    const [first] = screen.getAllByRole('checkbox', { name: '' })
    await user.click(first!)

    expect(screen.queryByText('무료배송')).not.toBeInTheDocument()
    expect(screen.getByText('3,000원')).toBeInTheDocument()
    expect(screen.getAllByText('33,000원').length).toBeGreaterThan(0)
  })

  it('[AC-GATE-002] 비회원은 장바구니 대신 로그인 안내를 보고 서버를 부르지 않는다', async () => {
    let requested = 0
    server.use(
      http.get(CART_URL, () => {
        requested += 1
        return HttpResponse.json({ data: { items: [] } })
      }),
    )
    logout()
    renderAt('/cart')

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 / 회원가입' })).toBeInTheDocument()
    expect(requested).toBe(0)
    expect(screen.queryByText('냥이상점')).not.toBeInTheDocument()
  })

  it('[AC-GATE-004] 세션 확인이 실패해 회원 여부를 모를 때 주문하기는 결제로 넘기지 않고 게이트를 띄운다', async () => {
    // refresh 5xx면 세션 유무를 알 수 없어(unknown) 라우트 게이트가 화면을 막지 않는다 —
    // 그 틈으로 비회원이 결제로 들어가지 않게 화면 안 게이트가 마지막 방어선으로 남아 있다.
    const user = userEvent.setup()
    resetAuth()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    const router = renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/cart')
  })

  it('[AC-GATE-003] 회원이 주문하기를 누르면 결제(주문서) 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout'))
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()
  })

  it('[AC-BUYNOW-BLOCK-001] 옛 바로구매 진입(/checkout?buyNow=)은 장바구니로 돌려보낸다', async () => {
    const router = renderAt('/checkout?buyNow=p-feeder-5l&option=기본&qty=1')
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
    expect(await screen.findByText('냥이상점')).toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-004] 품절 라인만 남아도 전체 선택 체크박스가 활성화된다(품절도 선택 가능)', async () => {
    seedCart([scratcherRow()])
    resetCartSelection()
    renderAt('/cart')

    const selectAll = await screen.findByRole('checkbox', { name: /전체 선택/ })
    expect(selectAll).toBeEnabled()
  })

  it('[AC-CART-SOLDOUT-001] 품절 상품이 선택되면 주문하기가 비활성화되고 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    expect(screen.queryByText('주문할 수 없는 상품이 포함되어 있어요')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    expect(screen.getByRole('button', { name: /주문하기/ })).toBeDisabled()
    expect(screen.getByText('주문할 수 없는 상품이 포함되어 있어요')).toBeInTheDocument()
  })

  it('[AC-CART-SOLDOUT-002] 품절 상품을 선택해 선택 삭제(DELETE 본문)로 지울 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('멍멍마트')
    expect(screen.getByText('품절')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '냥이상점' }))
    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    await user.click(screen.getByRole('button', { name: '선택 삭제' }))

    await waitFor(() => expect(screen.queryByText('품절')).not.toBeInTheDocument())
    expect(screen.queryByText('멍멍마트')).not.toBeInTheDocument()
    expect(screen.getByText('냥이상점')).toBeInTheDocument()
    expect(currentCart().map(r => r.cartItemId)).toEqual([1])
  })

  it('[AC-CART-DELETE-001] 라인 X 버튼은 그 라인만 DELETE로 지운다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    const [removeFirst] = screen.getAllByRole('button', { name: '장바구니에서 삭제' })
    await user.click(removeFirst!)

    await waitFor(() => expect(screen.queryByText('냥이상점')).not.toBeInTheDocument())
    expect(screen.getByText('멍멍마트')).toBeInTheDocument()
    expect(currentCart().map(r => r.cartItemId)).toEqual([2])
  })

  it('[AC-CART-ERROR-001] 수량 변경(PATCH) 실패 시 에러 토스트를 보여주고 서버 값으로 되돌린다', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch(CART_ITEM_URL, () =>
        HttpResponse.json({ errorCode: 50201, message: '재고가 부족합니다.' }, { status: 409 }),
      ),
    )
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '증가' }))

    expect(await screen.findByText('재고가 부족해요')).toBeInTheDocument()
    // 낙관적으로 올랐던 수량이 서버 재조회로 1로 돌아온다.
    await waitFor(() => expect(screen.getByRole('textbox', { name: '값' })).toHaveValue('1'))
    expect(currentCart().find(r => r.cartItemId === 1)?.quantity).toBe(1)
  })

  it('[AC-CART-ERROR-003] 삭제(DELETE) 실패 시 에러 토스트 문구를 보여주고 라인은 그대로다', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(CART_ITEMS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류가 발생했어요' }, { status: 500 }),
      ),
    )
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '선택 삭제' }))

    expect(await screen.findByText('서버 오류가 발생했어요')).toBeInTheDocument()
    expect(screen.getByText('냥이상점')).toBeInTheDocument()
    expect(currentCart()).toHaveLength(2)
  })

  it('[AC-CART-ERROR-002] 장바구니 조회(GET /carts) 실패 시 빈 상태가 아니라 다시 시도 화면을 보여준다', async () => {
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/cart')

    expect(await screen.findByText('장바구니를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.queryByText('장바구니가 비어 있어요')).not.toBeInTheDocument()
  })

  it('[AC-CART-QTY-MIN-001] 수량 1이면 감소 버튼이 비활성이라 PATCH quantity 0이 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    const decrease = screen.getByRole('button', { name: '감소' })
    expect(decrease).toBeDisabled()
    await user.click(decrease)

    expect(currentCart().find(r => r.cartItemId === 1)?.quantity).toBe(1)
  })

  it('[AC-CART-QTY-MAX-001] 수량 상한은 min(99, 잔여 재고)라 재고만큼 담으면 증가 버튼이 막힌다', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1, storeName: '냥이상점', quantity: 10, remainingStock: 10 }),
    ])
    resetCartSelection()
    renderAt('/cart')
    await screen.findByText('냥이상점')
    expect(screen.getByRole('button', { name: '증가' })).toBeDisabled()
  })

  it('[AC-CART-STOCK-001] 재고보다 많이 담긴 라인은 경고를 표기하고 선택 시 주문하기를 막는다', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1, storeName: '냥이상점', quantity: 5, remainingStock: 3 }),
    ])
    resetCartSelection()
    renderAt('/cart')
    await screen.findByText('냥이상점')
    expect(screen.getByText('남은 재고가 3개예요. 수량을 줄여주세요')).toBeInTheDocument()
    expect(screen.getByText('남은 재고보다 많이 담긴 상품이 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /주문하기/ })).toBeDisabled()
  })

  it('[AC-CART-SOLDOUT-003] 품절을 빼고 선택하면 주문하기가 활성이고 합계에 품절이 빠진다', async () => {
    renderAt('/cart')
    await screen.findByText('냥이상점')

    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    // 합계는 급식기 64,000원만 — 품절 29,000원을 더한 93,000원은 어디에도 없다.
    expect(screen.getAllByText('64,000원').length).toBeGreaterThan(0)
    expect(screen.queryByText('93,000원')).not.toBeInTheDocument()
  })
})

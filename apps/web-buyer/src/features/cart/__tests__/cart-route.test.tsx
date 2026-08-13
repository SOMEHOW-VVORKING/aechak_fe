import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { resetCartSelection, setCartItemSelected } from '@/shared/cart'
import { logout, resetAuth } from '@/shared/auth'
import {
  CART_ITEMS_URL,
  CART_URL,
  currentCart,
  makeCartRow,
  seedCart,
  server,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// 서버 장바구니 시드 — 냥이상점 급식기(주문 가능·선택) + 멍멍마트 스크래쳐(품절·선택 해제).
// 선택 상태는 클라이언트 스토어라 시드와 별개로 세운다(새 라인 기본 선택 → 품절만 해제).
function seedTwoSellers() {
  seedCart([
    makeCartRow({ cartItemId: 1, storeName: '냥이상점', sellerId: 1 }),
    makeCartRow({
      cartItemId: 2,
      sellerId: 2,
      storeName: '멍멍마트',
      optionCombinationId: 90,
      productId: 'p-scratcher-x',
      productName: '스크래쳐 하우스 2종 세트',
      selectedOptions: '기본',
      price: 29000,
      itemStatus: 'OUT_OF_STOCK',
      remainingStock: 0,
    }),
  ])
  resetCartSelection()
  setCartItemSelected(2, false)
}

describe('/cart', () => {
  beforeEach(() => {
    seedTwoSellers()
    resetAuth()
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

  it('[AC-CART-PRICE-001] 할인 중인 라인은 주문 가능·불가 양쪽에서 원가를 취소선으로 덧붙이고 할인율 %는 두지 않는다', async () => {
    // 서버가 originalPrice(정가+옵션 추가금)를 직접 내려준다 — 화면이 price/discountRate로
    // 역산하면 옵션 추가금에 할인이 걸린 값이 나와 어긋난다(BE SCRUM-173 커밋).
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
    expect(screen.getAllByText('30,000원').every(el => !el.className.includes('line-through'))).toBe(
      true,
    )

    // 할인율 뱃지는 두지 않는다 — 서버 discountRate는 상품 정가 기준이라 기준이 다르다.
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-002] 수량을 늘리면 서버 반영(PATCH) 후 결제예정금액이 갱신된다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드 급식기 64,000원 → +1 → 128,000원 (PATCH 후 재조회로 반영)
    await user.click(screen.getByRole('button', { name: '증가' }))
    expect(await screen.findAllByText('128,000원')).not.toHaveLength(0)
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

  it('[AC-GATE-002] 비회원이 주문하기를 누르면 게이트가 뜨고 결제로 넘어가지 않는다', async () => {
    const user = userEvent.setup()
    logout()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    // 게이트가 뜨고, 여전히 장바구니 화면(주문서로 이동하지 않음).
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeInTheDocument()
    expect(screen.queryByText('주문서')).not.toBeInTheDocument()
  })

  it('[AC-GATE-003] 회원이 주문하기를 누르면 결제(주문서) 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    // 기본 로그인 상태(beforeEach의 resetAuth) — 게이트 없이 바로 주문서로 이동.
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    expect(await screen.findByText('주문서')).toBeInTheDocument()
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-004] 품절 라인만 남아도 전체 선택 체크박스가 활성화된다(품절도 선택 가능)', async () => {
    // 품절 스크래쳐만 있는 장바구니.
    seedCart([
      makeCartRow({
        cartItemId: 2,
        sellerId: 2,
        storeName: '멍멍마트',
        optionCombinationId: 90,
        productId: 'p-scratcher-x',
        productName: '스크래쳐 하우스 2종 세트',
        selectedOptions: '기본',
        price: 29000,
        itemStatus: 'OUT_OF_STOCK',
        remainingStock: 0,
      }),
    ])
    resetCartSelection()
    renderAt('/cart')

    const selectAll = await screen.findByRole('checkbox', { name: /전체 선택/ })
    // 품절도 체크/삭제 대상이라 전체 선택은 활성 상태다.
    expect(selectAll).toBeEnabled()
  })

  it('[AC-CART-SOLDOUT-001] 품절 상품이 선택되면 주문하기가 비활성화되고 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드는 품절 미선택 → 주문하기 (1) 활성, 안내 없음.
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    expect(screen.queryByText('주문할 수 없는 상품이 포함되어 있어요')).not.toBeInTheDocument()

    // 품절 스크래쳐가 있는 멍멍마트 그룹을 선택 → 주문하기 비활성 + 안내.
    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    expect(screen.getByRole('button', { name: /주문하기/ })).toBeDisabled()
    expect(screen.getByText('주문할 수 없는 상품이 포함되어 있어요')).toBeInTheDocument()
  })

  it('[AC-CART-SOLDOUT-002] 품절 상품을 선택해 선택 삭제(DELETE)로 지울 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('멍멍마트')
    expect(screen.getByText('품절')).toBeInTheDocument()

    // 시드는 급식기가 선택돼 있으니 냥이상점 그룹을 먼저 해제해 품절 스크래쳐만 선택되게 한다.
    await user.click(screen.getByRole('checkbox', { name: '냥이상점' }))
    // 품절 스크래쳐가 있는 멍멍마트 그룹을 선택 → 선택 삭제.
    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    await user.click(screen.getByRole('button', { name: '선택 삭제' }))

    // 서버 삭제 후 재조회로 품절 라인이 사라지고 냥이상점(급식기)은 그대로 남는다.
    await waitFor(() => expect(screen.queryByText('품절')).not.toBeInTheDocument())
    expect(screen.queryByText('멍멍마트')).not.toBeInTheDocument()
    expect(screen.getByText('냥이상점')).toBeInTheDocument()
  })

  it('[AC-CART-ERROR-001] 수량 변경(PATCH) 실패 시 에러 토스트 문구를 보여준다', async () => {
    const user = userEvent.setup()
    // 다음 PATCH를 재고 부족(50201)으로 강제한다 — afterEach의 resetHandlers로 원복.
    server.use(
      http.patch(`${CART_ITEMS_URL}/:cartItemId`, () =>
        HttpResponse.json({ errorCode: 50201, message: '재고가 부족합니다.' }, { status: 409 }),
      ),
    )
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '증가' }))

    expect(await screen.findByText('재고가 부족해요')).toBeInTheDocument()
  })

  it('[AC-CART-ERROR-003] 삭제(DELETE) 실패 시 에러 토스트 문구를 보여주고 라인은 그대로다', async () => {
    const user = userEvent.setup()
    // 다음 DELETE를 서버 오류로 강제한다 — afterEach의 resetHandlers로 원복.
    server.use(
      http.delete(CART_ITEMS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류가 발생했어요' }, { status: 500 }),
      ),
    )
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드는 급식기가 선택돼 있어 선택 삭제가 활성이다.
    await user.click(screen.getByRole('button', { name: '선택 삭제' }))

    // onError → cartErrorMessage → AppToast 연결이 살아 있어야 사용자에게 실패가 보인다.
    expect(await screen.findByText('서버 오류가 발생했어요')).toBeInTheDocument()
    expect(screen.getByText('냥이상점')).toBeInTheDocument()
    expect(currentCart()).toHaveLength(2)
  })

  it('[AC-CART-ERROR-002] 장바구니 조회(GET /carts) 실패 시 다시 시도 화면을 보여준다', async () => {
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/cart')

    expect(await screen.findByText('장바구니를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-CART-QTY-MIN-001] 수량 1이면 감소 버튼이 비활성이라 PATCH quantity 0이 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 주문 가능 라인(급식기, 수량 1)의 스테퍼 — min=1이라 감소가 막혀 있어야 한다.
    const decrease = screen.getByRole('button', { name: '감소' })
    expect(decrease).toBeDisabled()
    await user.click(decrease)

    // 서버 수량이 그대로 1 — 0으로 깎는 PATCH가 발화하지 않았다.
    expect(currentCart().find(r => r.cartItemId === 1)?.quantity).toBe(1)
  })

  it('[AC-CART-SOLDOUT-003] 품절을 빼고 선택하면 주문하기가 활성이고 합계에 품절이 빠진다', async () => {
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드 기본: 급식기만 선택(품절 스크래쳐 해제) → 주문하기 (1) 활성.
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    // 합계는 급식기 64,000원만 — 품절 29,000원을 더한 93,000원은 어디에도 없다.
    expect(screen.getAllByText('64,000원').length).toBeGreaterThan(0)
    expect(screen.queryByText('93,000원')).not.toBeInTheDocument()
  })
})

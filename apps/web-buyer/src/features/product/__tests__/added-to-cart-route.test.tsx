import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetCartSelection, setCartItemSelected } from '@/shared/cart'
import { resetAuth } from '@/shared/auth'
import { REAL_PRODUCT_ID, currentCart, makeCartRow, seedCart } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string, staleTime = 0) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('장바구니 담기 확인 바텀시트', () => {
  beforeEach(() => {
    seedCart()
    resetCartSelection()
    resetAuth()
    // 회원 세션(메모리 access 보유)이 전제인 화면이다 — 토큰이 세션의 정본이라 이걸로 로그인시킨다.
    setAccessToken('member-token')
  })

  it('[AC-CART-SHEET-001] 담기(POST) 성공 시 확인 시트가 열리고 함께 보면 좋은 상품 섹션이 보인다', async () => {
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    // 하단 액션바의 "장바구니" → 옵션 선택 시트 → "장바구니 담기"
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 하단 중앙 토스트는 뜨지 않는다.
    expect(screen.queryByText('장바구니에 담았어요.')).not.toBeInTheDocument()

    // 확인 시트가 열리고 단일 "함께 보면 좋은 상품" 섹션이 보인다(추천 탭 없음).
    expect(await screen.findByRole('heading', { name: '함께 보면 좋은 상품' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('앱 연동 자동 급식기 6L 듀얼 호퍼')).toBeInTheDocument()

    // 서버 장바구니에 실제로 담겼다(기본형 조합 1개).
    await waitFor(() => {
      expect(currentCart()).toHaveLength(1)
    })
    expect(currentCart()[0]?.optionCombinationId).toBe(1)
    // 방금 담은 라인 요약(옵션/수량)이 시트에 보인다.
    expect(await screen.findByText('기본형 / 수량 1개')).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-002] 장바구니 보기를 누르면 장바구니로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 보기' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
  })

  it('[AC-CART-SHEET-004] 같은 옵션 재담기는 라인 1건에 수량이 합산되고 시트가 합산 총수량을 보여준다', async () => {
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByText('기본형 / 수량 1개')
    await user.click(screen.getByRole('button', { name: '닫기' }))

    // 2차 담기(같은 옵션) — 서버가 수량을 합산한다.
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    await waitFor(() => {
      expect(currentCart()).toHaveLength(1)
      expect(currentCart()[0]?.quantity).toBe(2)
    })
    expect(await screen.findByText('기본형 / 수량 2개')).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-006] 옵션이 다르면 별개 라인으로 담기고 새 라인은 기본 선택이다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByText('기본형 / 수량 1개')
    await user.click(screen.getByRole('button', { name: '닫기' }))

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.selectOptions(screen.getByRole('combobox'), '프리미엄형')
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    await waitFor(() => {
      expect(currentCart()).toHaveLength(2)
    })
    expect(
      currentCart()
        .map(r => r.optionCombinationId)
        .sort(),
    ).toEqual([1, 2])
    expect(currentCart().every(r => r.quantity === 1)).toBe(true)

    // 장바구니로 이동 — 두 라인 모두 기본 선택 상태(전체 선택 2/2, 주문하기 (2)).
    await user.click(await screen.findByRole('button', { name: '장바구니 보기' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
    expect(await screen.findByRole('checkbox', { name: /전체 선택 \(2\/2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문하기 (2)' })).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-008] 해제해 둔 라인에 같은 옵션을 다시 담으면 그 라인이 선택 상태로 돌아온다', async () => {
    const user = userEvent.setup()
    seedCart([makeCartRow({ cartItemId: 1 })])
    setCartItemSelected(1, false)
    const router = renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 보기' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
    expect(await screen.findByRole('checkbox', { name: /전체 선택 \(1\/1\)/ })).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-005] 재고 초과 담기(50201)는 확인 시트 대신 에러 토스트를 띄운다', async () => {
    const user = userEvent.setup()
    // 기본형(잔여 10)을 이미 10개 담아둔 상태 — 1개만 더 담아도 재고 초과다.
    seedCart([makeCartRow({ cartItemId: 1, quantity: 10 })])
    renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    expect(await screen.findByText('재고가 부족해요')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '함께 보면 좋은 상품' })).not.toBeInTheDocument()
    expect(currentCart()[0]?.quantity).toBe(10)
  })

  it('[AC-CART-SHEET-003] 실 옵션 조합이 없는 목업 폴백 상품은 담기가 막히고 안내 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 서버 장바구니는 옵션 조합 id가 필수라 목업 상품은 담을 수 없다 — 확인 시트 대신 안내 토스트.
    expect(
      await screen.findByText('지금은 이 상품을 장바구니에 담을 수 없어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '함께 보면 좋은 상품' })).not.toBeInTheDocument()
    expect(currentCart()).toHaveLength(0)
  })
})

// 배지는 GET /carts 캐시(['cart'])의 표시 라인 수로 파생된다. 프로덕션 staleTime(main.tsx의 60초)을
// 재현해 담기의 무효화가 실제로 배지 캐시를 갱신하는지 본다 — staleTime 0이면 마운트 재조회가 배지를
// 알아서 고쳐 무효화가 깨져도 조용히 통과한다.
describe('담기 뒤 홈 배지 갱신', () => {
  beforeEach(() => {
    // 기본형이 아닌 다른 조합 1종만 담아 둔다 — 담기로 라인이 하나 늘어 1종에서 2종이 된다.
    seedCart([makeCartRow({ cartItemId: 1, optionCombinationId: 2, quantity: 3 })])
    resetCartSelection()
    resetAuth()
    setAccessToken('badge-invalidation-token')
  })
  afterEach(() => {
    setAccessToken(null)
  })

  it('[AC-CART-BADGE-001] 담기 성공 뒤 홈 배지가 새 품목 종류 수(수량 합이 아님)로 갱신된다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/', 1000 * 60)

    // 홈에서 배지 쿼리를 마운트해 캐시를 채운다 — 수량 3이어도 라인 1건이라 배지는 1.
    expect(await screen.findByLabelText('장바구니 (1)')).toBeInTheDocument()

    await router.navigate({ to: '/products/$productId', params: { productId: REAL_PRODUCT_ID } })
    await screen.findByText('리얼 프리미엄 자동 급식기')
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByRole('heading', { name: '함께 보면 좋은 상품' })

    await router.navigate({ to: '/' })

    // 캐시가 아직 fresh하므로, 무효화가 닿지 않으면 배지가 1에 머문다.
    expect(await screen.findByLabelText('장바구니 (2)')).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetCartSelection } from '@/shared/cart'
import { resetAuth } from '@/shared/auth'
import { REAL_PRODUCT_ID, currentCart, makeCartRow, seedCart } from '../../../testing/msw/server'
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

describe('장바구니 담기 확인 바텀시트', () => {
  beforeEach(() => {
    seedCart()
    resetCartSelection()
    resetAuth()
  })

  it('[AC-CART-SHEET-001] 담기(POST) 성공 시 확인 시트가 열리고 함께 보면 좋은 상품 섹션이 보인다', async () => {
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    // 하단 액션바의 "장바구니" → 옵션 선택 시트 → "장바구니 담기"
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 하단 중앙 토스트는 더 이상 뜨지 않는다.
    expect(screen.queryByText('장바구니에 담았어요.')).not.toBeInTheDocument()

    // 확인 시트가 열리고 단일 "함께 보면 좋은 상품" 섹션이 보인다(추천 탭 제거).
    expect(await screen.findByRole('heading', { name: '함께 보면 좋은 상품' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    // 일반 fallback 큐레이션 상품이 캐러셀에 노출된다.
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

    // 1차 담기(기본형 1개) → 확인 시트 닫기.
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByText('기본형 / 수량 1개')
    await user.click(screen.getByRole('button', { name: '닫기' }))

    // 2차 담기(같은 옵션) — MSW existing 분기(수량 합산)를 실제로 태운다.
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 서버 카트는 라인 1건 유지 + 수량 합산.
    await waitFor(() => {
      expect(currentCart()).toHaveLength(1)
      expect(currentCart()[0]?.quantity).toBe(2)
    })
    // 확인 시트 요약은 이번에 담은 수량이 아니라 그 라인의 합산 총수량이다(의도된 동작).
    expect(await screen.findByText('기본형 / 수량 2개')).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-006] 옵션이 다르면 별개 라인으로 담기고 새 라인은 기본 선택이다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    // 1차 담기(기본형) → 확인 시트 닫기.
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByText('기본형 / 수량 1개')
    await user.click(screen.getByRole('button', { name: '닫기' }))

    // 2차 담기(다른 옵션 조합) — MSW 신규 라인 분기를 기존 라인이 있는 상태에서 태운다.
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.selectOptions(screen.getByRole('combobox'), '프리미엄형')
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 서버 카트에 옵션 조합별 별개 라인 2건(합산 아님).
    await waitFor(() => {
      expect(currentCart()).toHaveLength(2)
    })
    expect(currentCart().map(r => r.optionCombinationId).sort()).toEqual([1, 2])
    expect(currentCart().every(r => r.quantity === 1)).toBe(true)

    // 장바구니로 이동 — 두 라인 모두 기본 선택 상태(전체 선택 2/2, 주문하기 (2)).
    await user.click(await screen.findByRole('button', { name: '장바구니 보기' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
    expect(await screen.findByRole('checkbox', { name: /전체 선택 \(2\/2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문하기 (2)' })).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-005] 재고 초과 담기(50201)는 확인 시트 대신 에러 토스트를 띄운다', async () => {
    const user = userEvent.setup()
    // 기본형(잔여 10)을 이미 10개 담아둔 상태 — 1개만 더 담아도 재고 초과다.
    seedCart([makeCartRow({ cartItemId: 1, quantity: 10 })])
    renderAt(`/products/${REAL_PRODUCT_ID}`)
    await screen.findByText('리얼 프리미엄 자동 급식기')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // cartErrorMessage(50201) 문구가 토스트로 뜨고, 확인 시트는 열리지 않으며 수량도 그대로다.
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
    expect(await screen.findByText('지금은 이 상품을 장바구니에 담을 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '함께 보면 좋은 상품' })).not.toBeInTheDocument()
    expect(currentCart()).toHaveLength(0)
  })
})

// 배지 개수는 목록과 별개 캐시 엔트리(['cart','count'])라, 담기 성공의 ['cart'] prefix 무효화가
// 개수 쿼리까지 털어야 홈 배지가 움직인다. 이 describe만 프로덕션 staleTime(main.tsx의 60초)을
// 재현하는 QueryClient를 쓴다 — staleTime 0이면 마운트 재조회가 배지를 알아서 고쳐, 무효화가
// 깨져도 단언이 조용히 통과한다.
describe('담기 뒤 홈 배지 갱신', () => {
  function renderWithProductionStaleTime(path: string) {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 1000 * 60, retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  beforeEach(() => {
    // 기본형이 아닌 다른 조합 1종만 담아 둔다 — 담기로 라인이 하나 늘어 1종에서 2종이 된다.
    seedCart([makeCartRow({ cartItemId: 1, optionCombinationId: 2 })])
    resetCartSelection()
    resetAuth()
    setAccessToken('badge-invalidation-token')
  })
  afterEach(() => {
    setAccessToken(null)
  })

  it('[AC-CART-SHEET-007] 담기 성공 뒤 홈 배지가 새 품목 종류 수로 갱신된다', async () => {
    const user = userEvent.setup()
    const router = renderWithProductionStaleTime('/')

    // 먼저 홈에서 배지 쿼리를 마운트해 캐시를 1종으로 채운다.
    expect(await screen.findByLabelText('장바구니 (1)')).toBeInTheDocument()

    await router.navigate({ to: '/products/$productId', params: { productId: REAL_PRODUCT_ID } })
    await screen.findByText('리얼 프리미엄 자동 급식기')
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await screen.findByRole('heading', { name: '함께 보면 좋은 상품' })

    await router.navigate({ to: '/' })

    // 캐시가 아직 fresh하므로, 무효화가 개수 쿼리에 닿지 않으면 배지가 1에 머문다.
    expect(await screen.findByLabelText('장바구니 (2)')).toBeInTheDocument()
  })
})

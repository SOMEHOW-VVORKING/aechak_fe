import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetCart } from '@/shared/cart'
import { resetAuth } from '@/shared/auth'
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
    resetCart()
    resetAuth()
  })

  it('[AC-CART-SHEET-001] 장바구니 담기 시 토스트 대신 확인 시트가 열리고 함께 보면 좋은 상품 섹션이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    // 하단 액션바의 "장바구니" → 옵션 선택 시트 → "장바구니 담기"
    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))

    // 하단 중앙 토스트는 더 이상 뜨지 않는다.
    expect(screen.queryByText('장바구니에 담았어요.')).not.toBeInTheDocument()

    // 확인 시트가 열리고 단일 "함께 보면 좋은 상품" 섹션이 보인다(추천 탭 제거).
    expect(await screen.findByRole('heading', { name: '함께 보면 좋은 상품' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    // override 큐레이션 상품이 캐러셀에 노출된다.
    expect(screen.getByText('앱 연동 자동 급식기 6L 듀얼 호퍼')).toBeInTheDocument()
  })

  it('[AC-CART-SHEET-002] 장바구니 보기를 누르면 장바구니로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    await user.click(screen.getByRole('button', { name: '장바구니' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 담기' }))
    await user.click(await screen.findByRole('button', { name: '장바구니 보기' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cart')
    })
  })
})

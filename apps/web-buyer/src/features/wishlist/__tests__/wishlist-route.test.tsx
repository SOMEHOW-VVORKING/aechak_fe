import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetWishlist } from '@/shared/catalog'
import { logout, resetAuth } from '@/shared/auth'
import { PRODUCT_FIXTURES, seedLikedProducts } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 찜 목록은 서버(GET /users/me/liked-products)로 구동한다. 상태·응답 계약은 testing/msw/server.ts가
// 소유하고, 여기선 seedLikedProducts로 시나리오를 세운다.
function likedSeed(ids: string[]) {
  return PRODUCT_FIXTURES.filter(f => ids.includes(f.product.productId)).map(f => f.product)
}

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

describe('/wishlist', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
  })

  it('[AC-WISH-004] 찜한 상품 그리드를 보여주고 하트 해제 시 실행 취소 토스트가 뜨며 목록에서 빠진다', async () => {
    seedLikedProducts(likedSeed(['p-real-1', 'p-real-2', 'p-real-3']))
    const user = userEvent.setup()
    renderAt('/wishlist')

    const hearts = await screen.findAllByRole('button', { name: '찜 해제' })
    const initialCount = hearts.length
    expect(initialCount).toBe(3)

    // 스토어 찜 탭이 컷돼 단일 섹션 헤더로 표시된다(탭이 아님).
    expect(screen.getByRole('heading', { name: '찜한 상품' })).toBeInTheDocument()

    await user.click(hearts[0]!)

    expect(await screen.findByText('찜을 해제했어요.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount - 1)
  })

  it('[AC-WISH-UNDO-001] 실행 취소를 누르면 해제한 상품이 목록으로 돌아온다', async () => {
    seedLikedProducts(likedSeed(['p-real-1', 'p-real-2', 'p-real-3']))
    const user = userEvent.setup()
    renderAt('/wishlist')

    const hearts = await screen.findAllByRole('button', { name: '찜 해제' })
    const initialCount = hearts.length
    // 시드한 3건이 그대로 떠야 한다 — 상대 카운트만 보면 앞 테스트가 남긴 해제 툼스톤 때문에
    // 2건만 뜬 상태에서도 통과해버려 시나리오가 조용히 축소된다.
    expect(initialCount).toBe(3)
    await user.click(hearts[0]!)
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount - 1)

    await user.click(await screen.findByRole('button', { name: '실행 취소' }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount),
    )
  })

  it('[AC-GATE-001] 비회원이 카드 하트를 누르면 게이트가 뜨고 찜은 토글되지 않는다', async () => {
    seedLikedProducts(likedSeed(['p-real-1', 'p-real-2']))
    const user = userEvent.setup()
    logout()
    renderAt('/wishlist')

    const hearts = await screen.findAllByRole('button', { name: '찜 해제' })
    const initialCount = hearts.length
    expect(initialCount).toBe(2)

    await user.click(hearts[0]!)

    // 게이트가 뜨고, 찜은 그대로(토글 안 됨) — 해제 토스트도 뜨지 않는다.
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount)
    expect(screen.queryByText('찜을 해제했어요.')).not.toBeInTheDocument()
  })

  it('[AC-WISH-005] 찜한 상품이 없으면 빈 상태를 보여준다', async () => {
    seedLikedProducts([])
    renderAt('/wishlist')

    expect(await screen.findByText('아직 찜한 상품이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 둘러보기' })).toBeInTheDocument()
  })

  it('[AC-WISH-006] 품절 찜 상품 카드에 재입고 알림 버튼이 없다', async () => {
    // p-real-5 = 스크래쳐 하우스 2종 세트(OUT_OF_STOCK)
    seedLikedProducts(likedSeed(['p-real-5']))
    renderAt('/wishlist')

    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재입고 알림' })).not.toBeInTheDocument()
  })
})

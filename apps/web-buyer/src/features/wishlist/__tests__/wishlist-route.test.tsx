import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { removeWish, resetWishlist } from '@/shared/catalog'
import { logout, resetAuth } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'

const SEED_IDS = ['p-feeder-5l', 'p-scratcher', 'p-joint-90', 'p-litter-85']

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

  it('[AC-WISH-004] 찜한 상품 그리드를 보여주고 하트 해제 시 실행 취소 토스트가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/wishlist')

    const hearts = await screen.findAllByRole('button', { name: '찜 해제' })
    const initialCount = hearts.length
    expect(initialCount).toBeGreaterThan(0)

    // 스토어 찜 탭이 컷돼 단일 섹션 헤더로 표시된다(탭이 아님).
    expect(screen.getByRole('heading', { name: '찜한 상품' })).toBeInTheDocument()

    await user.click(hearts[0]!)

    expect(await screen.findByText('찜을 해제했어요.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount - 1)
  })

  it('[AC-GATE-001] 비회원이 카드 하트를 누르면 게이트가 뜨고 찜은 토글되지 않는다', async () => {
    const user = userEvent.setup()
    logout()
    renderAt('/wishlist')

    const hearts = await screen.findAllByRole('button', { name: '찜 해제' })
    const initialCount = hearts.length
    expect(initialCount).toBeGreaterThan(0)

    await user.click(hearts[0]!)

    // 게이트가 뜨고, 찜은 그대로(토글 안 됨) — 해제 토스트도 뜨지 않는다.
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(initialCount)
    expect(screen.queryByText('찜을 해제했어요.')).not.toBeInTheDocument()
  })

  it('[AC-WISH-005] 찜한 상품이 없으면 빈 상태를 보여준다', async () => {
    SEED_IDS.forEach(removeWish)
    renderAt('/wishlist')

    expect(await screen.findByText('아직 찜한 상품이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 둘러보기' })).toBeInTheDocument()
  })

  it('[AC-WISH-006] 품절 찜 상품 카드에 재입고 알림 버튼이 없다', async () => {
    renderAt('/wishlist')

    // 품절 시드(스크래쳐 하우스 2종 세트)는 그대로 렌더되지만 재입고 알림 버튼은 없다.
    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재입고 알림' })).not.toBeInTheDocument()
  })
})

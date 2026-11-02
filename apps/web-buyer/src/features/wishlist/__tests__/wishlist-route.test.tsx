import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken } from '@aechak/api'
import { resetWishlist } from '@/shared/catalog'
import { logout, resetAuth } from '@/shared/auth'
import { LIKED_PRODUCTS_URL, PRODUCT_FIXTURES, seedLikedProducts, server } from '@/testing/msw/server'
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
    // 회원 세션(메모리 access 보유)이 전제인 화면이다 — 토큰이 세션의 정본이라 이걸로 로그인시킨다.
    setAccessToken('member-token')
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

  it('[AC-WISH-GUEST-001] 비회원은 찜 목록 대신 로그인 안내를 보고 서버를 부르지 않는다', async () => {
    seedLikedProducts(likedSeed(['p-real-1', 'p-real-2']))
    let requested = 0
    server.use(
      http.get(LIKED_PRODUCTS_URL, () => {
        requested += 1
        return HttpResponse.json({ data: { products: [], nextCursor: null, hasNext: false } })
      }),
    )
    logout()
    renderAt('/wishlist')

    // 빈 화면이나 영구 스켈레톤이 아니라 왜 비었는지와 다음 행동이 보인다.
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 / 회원가입' })).toBeInTheDocument()
    // 회원 전용 API를 아예 부르지 않으므로 401 → 전역 로그인 리다이렉트로 화면을 잃지 않는다.
    expect(requested).toBe(0)
    expect(screen.queryByRole('button', { name: '찜 해제' })).not.toBeInTheDocument()
  })

  it('[AC-WISH-005] 찜한 상품이 없으면 빈 상태를 보여준다', async () => {
    seedLikedProducts([])
    renderAt('/wishlist')

    expect(await screen.findByText('아직 찜한 상품이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 둘러보기' })).toBeInTheDocument()
  })

  it('[AC-WISH-020] 진입 불가(isViewable=false) 찜 상품은 카드 탭이 막히고 판매 중단으로 표시된다', async () => {
    // PRODUCT_FIXTURES를 고치면 카탈로그/검색 핸들러까지 영향을 받으므로 시드 시점에만 오버라이드한다.
    seedLikedProducts(
      likedSeed(['p-real-1']).map(row => ({ ...row, isViewable: false, isPurchasable: false })),
    )
    renderAt('/wishlist')

    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '강아지 연어 사료 2kg 상세 보기' }),
    ).not.toBeInTheDocument()
    // 품절과 같은 썸네일 오버레이를 쓰되 사유가 달라 라벨만 바꾼다.
    expect(screen.getByText('판매 중단')).toBeInTheDocument()
    expect(screen.queryByText('품절')).not.toBeInTheDocument()
    // 찜 해제 수단(하트)은 그대로 남는다.
    expect(screen.getByRole('button', { name: '찜 해제' })).toBeInTheDocument()
  })

  it('[AC-WISH-021] 진입 가능한 찜 상품은 카드 탭으로 상세에 갈 수 있다', async () => {
    seedLikedProducts(likedSeed(['p-real-1']))
    renderAt('/wishlist')

    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '강아지 연어 사료 2kg 상세 보기' })).toBeInTheDocument()
    expect(screen.queryByText('판매 중단')).not.toBeInTheDocument()
  })

  it('[AC-WISH-006] 품절 찜 상품 카드에 재입고 알림 버튼이 없다', async () => {
    // p-real-5 = 스크래쳐 하우스 2종 세트(OUT_OF_STOCK)
    seedLikedProducts(likedSeed(['p-real-5']))
    renderAt('/wishlist')

    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재입고 알림' })).not.toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import { resetRegistry, resetWishlist } from '@/shared/catalog'
import { PRODUCT_FIXTURES, PRODUCT_LIKE_URL, seedLikedProducts, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function likedSeed(ids: string[]) {
  return PRODUCT_FIXTURES.filter(f => ids.includes(f.product.productId)).map(f => f.product)
}

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

describe('/market', () => {
  beforeEach(() => {
    resetAuth()
    // 회원 세션(메모리 access 보유)이 전제인 화면이다 — 토큰이 세션의 정본이라 이걸로 로그인시킨다.
    setAccessToken('member-token')
    resetRegistry()
    resetWishlist()
  })

  it('[AC-CATALOG-005] ?category=<라벨> 진입 시 이름이 같은 중분류가 초기 선택돼 결과가 걸러진다', async () => {
    renderAt('/market?category=' + encodeURIComponent('산책용품'))

    // 트리 로드 후 필터(category=12)가 비동기로 적용된다. 필터 전 임시 목록의 노드를 잡지 않도록
    // 먼저 사료 상품이 사라질 때까지 기다린 뒤(=필터 확정), 안정된 산책용품 상품을 확인한다.
    await waitFor(() => expect(screen.queryByText('강아지 연어 사료 2kg')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('자동 리드줄 5m 대형견용')).toBeInTheDocument())
  })

  it('[AC-CATALOG-007] 대분류 선택 시 중분류 그리드가 뜨고 카테고리 토글로 접고 펼칠 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 대분류 칩은 트리 로드 후 뜬다.
    await user.click(await screen.findByRole('button', { name: '강아지' }))
    // 대분류를 고르면 중분류 그리드가 열려 하위 중분류(산책용품)가 보인다.
    expect(await screen.findByRole('button', { name: '산책용품' })).toBeInTheDocument()

    // 카테고리 토글로 접으면 사라지고 다시 펼치면 나타난다.
    await user.click(screen.getByRole('button', { name: /카테고리/ }))
    expect(screen.queryByRole('button', { name: '산책용품' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /카테고리/ }))
    expect(await screen.findByRole('button', { name: '산책용품' })).toBeInTheDocument()
  })

  it('[AC-CATALOG-008] 품절 상품은 품절 배지로 표시된다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 고양이 > 위생/미용(id 21)에는 품절 상품(스크래쳐)이 있다.
    await user.click(await screen.findByRole('button', { name: '고양이' }))
    await user.click(await screen.findByRole('button', { name: '위생/미용' }))

    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
    expect(screen.getByText('품절')).toBeInTheDocument()
  })

  it('[AC-CATALOG-009] 대분류 탭은 서버 트리에서 오고(브랜드관 없음) 전환 시 결과가 걸러진다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 대분류 칩 = 전체 + 트리 depth-1(강아지/고양이). 목업의 브랜드관/공통은 없다.
    expect(await screen.findByRole('button', { name: '강아지' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '고양이' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '브랜드관' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '공통' })).not.toBeInTheDocument()

    // 고양이 대분류로 전환하면 고양이 상품만 남고 강아지 상품은 걸러진다.
    await user.click(screen.getByRole('button', { name: '고양이' }))
    expect(await screen.findByText('벤토나이트 고양이 모래 8.5L')).toBeInTheDocument()
    expect(screen.queryByText('강아지 연어 사료 2kg')).not.toBeInTheDocument()
  })

  it('[AC-CATALOG-010] 더보기로 다음 페이지 상품이 이어 붙는다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 첫 페이지(2개)만 먼저 뜬다 — 3번째 상품은 아직 없다.
    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(screen.queryByText('벤토나이트 고양이 모래 8.5L')).not.toBeInTheDocument()

    // 더보기를 누르면 다음 페이지가 이어 붙는다.
    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByText('벤토나이트 고양이 모래 8.5L')).toBeInTheDocument()
  })

  it('[AC-CATALOG-011] 낮은가격순으로 바꾸면 결과가 가격 오름차순으로 다시 정렬된다', async () => {
    const user = userEvent.setup()
    renderAt('/market')

    // 최신순 첫 페이지엔 연어 사료가 있고 가장 싼 츄르는 없다.
    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(screen.queryByText('참치 츄르 40개입')).not.toBeInTheDocument()

    // 낮은 가격순으로 바꾸면 가장 싼 츄르가 첫 페이지로 올라오고 연어 사료는 밀려난다.
    await user.click(screen.getByRole('tab', { name: '낮은 가격순' }))
    expect(await screen.findByText('참치 츄르 40개입')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('강아지 연어 사료 2kg')).not.toBeInTheDocument())
  })

  it('[AC-CATALOG-013] 이전에 찜한 상품은 찜 목록 방문 없이 첫 렌더부터 하트가 채워진다', async () => {
    // 카드 응답 isLiked(SCRUM-190)를 fetch 시점에 미러로 시드한다. 첫 페이지 = p-real-1/p-real-2 중
    // p-real-1만 찜 상태로 내려오므로 그 카드만 '찜 해제'(채워짐), 나머지는 '찜하기'(빈 하트).
    seedLikedProducts(likedSeed(['p-real-1']))
    renderAt('/market')

    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '찜 해제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '찜하기' })).toBeInTheDocument()
  })

  it('[AC-GATE-001] 비회원이 마켓 카드 하트를 누르면 게이트가 뜨고 찜 요청이 나가지 않는다', async () => {
    // 찜 토글은 회원 전용(POST/DELETE /products/{id}/like)이라 비회원은 요청 전에 막아야 한다.
    // 마켓은 비회원에게 열린 화면이므로 이 게이트가 실제로 닿는 자리다.
    let likeCalls = 0
    server.use(
      http.post(PRODUCT_LIKE_URL, () => {
        likeCalls += 1
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    logout()
    renderAt('/market')

    const hearts = await screen.findAllByRole('button', { name: '찜하기' })
    await user.click(hearts[0]!)

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(likeCalls).toBe(0)
    expect(screen.queryByRole('button', { name: '찜 해제' })).not.toBeInTheDocument()
  })

  it('[AC-CATALOG-012] 비회원은 카테고리 트랩 없이 상품만 본다(대분류 칩은 전체만)', async () => {
    logout()
    renderAt('/market')

    // 상품 목록(permitAll)은 그대로 뜬다.
    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    // 카테고리 트리(인증 필요)는 요청하지 않아 대분류 칩은 전체만 남는다.
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강아지' })).not.toBeInTheDocument()
  })
})

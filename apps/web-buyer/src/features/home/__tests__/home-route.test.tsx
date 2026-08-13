import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetWishlist } from '@/shared/catalog'
import { logout, resetAuth } from '@/shared/auth'
import { makeCartRow, seedCart, server } from '../../../testing/msw/server'
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

describe('/ (홈 카테고리 칩 인플레이스 필터)', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
  })

  it('[AC-HOME-008] 칩을 누르면 화면 이동 없이 인기 랭킹이 그 카테고리로 좁혀진다', async () => {
    const user = userEvent.setup()
    renderAt('/')

    // 초기(전체)엔 여러 카테고리 상품이 함께 보인다
    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument() // 사료/간식
    expect(screen.getByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument() // 위생/미용

    // 위생/미용 칩 선택 → 그 자리에서 좁혀진다
    await user.click(screen.getByRole('button', { name: '위생/미용' }))

    // 헤더가 선택 카테고리를 반영(괄호 표기)하고, 위생/미용 상품만 남는다
    expect(screen.getByText('지금 인기 있는 상품 (위생/미용)')).toBeInTheDocument()
    expect(screen.getByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument()
    expect(screen.queryByText('츄르 참치맛 40개입')).not.toBeInTheDocument()

    // 화면 이동 없음 — 홈 앱바(애착)는 그대로이고, 마켓에만 있는 상품(홈 랭킹 밖)은 뜨지 않는다
    expect(screen.getByText('애착')).toBeInTheDocument()
    expect(screen.queryByText('슬리커 브러시 이중모용')).not.toBeInTheDocument()
  })

  it('[AC-HOME-015] 인기 랭킹은 상위 5개까지만 렌더된다(6위 이하 숨김)', async () => {
    renderAt('/')

    // 상위 5개(mock RANKING_IDS 1~5위)는 모두 보인다
    expect(await screen.findByText('대용량 모래 8.5L 벤토나이트')).toBeInTheDocument() // 1위
    expect(screen.getByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument() // 2위
    expect(screen.getByText('츄르 참치맛 40개입')).toBeInTheDocument() // 3위
    expect(screen.getByText('관절 영양제 코코넛맛 90정')).toBeInTheDocument() // 4위
    expect(screen.getByText('강아지 사료 연어 2kg')).toBeInTheDocument() // 5위

    // 6위(노즈워크 담요 장난감)는 상위 5 제한으로 잘려 어디에도 렌더되지 않는다
    // (추천 캐러셀 RECOMMENDED_IDS에도 없어, 부재 = 랭킹에서 잘린 것)
    expect(screen.queryByText('노즈워크 담요 장난감')).not.toBeInTheDocument()
  })

  it('[AC-HOME-009] "마켓에서 더 보기"는 선택 카테고리를 담아 마켓으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByText('츄르 참치맛 40개입')

    // 위생/미용 선택 후 더 보기 → 해당 카테고리가 열린 마켓으로 이동
    await user.click(screen.getByRole('button', { name: '위생/미용' }))
    await user.click(screen.getByRole('button', { name: '마켓에서 더 보기' }))

    // 마켓으로 전환(홈 앱바 '애착'이 사라짐)되고, 위생/미용(실 트리 categoryId 21) 카테고리가 적용돼
    // 그 카테고리의 실 API 상품(벤토나이트 고양이 모래)이 마켓 그리드에 보인다.
    await waitFor(() => expect(screen.getByText('벤토나이트 고양이 모래 8.5L')).toBeInTheDocument())
    expect(screen.queryByText('애착')).not.toBeInTheDocument()
    // 홈 랭킹(목업)에 있던 사료/간식 상품 문구는 마켓(실 API)에 없다
    expect(screen.queryByText('츄르 참치맛 40개입')).not.toBeInTheDocument()
  })
})

describe('/ (앱바 장바구니 배지 — access token 게이트)', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
    // 품목 2종(수량 2+3=5)을 담아 둔다 — 배지가 수량 합계가 아니라 종류 수를 보여주는지 가른다.
    // 토큰이 없으면 담겨 있어도 조회 자체를 안 해야 한다.
    seedCart([
      makeCartRow({ cartItemId: 1, optionCombinationId: 1, quantity: 2 }),
      makeCartRow({ cartItemId: 2, optionCombinationId: 2, quantity: 3 }),
    ])
  })
  afterEach(() => {
    setAccessToken(null)
  })

  it('[AC-CART-BADGE-001] access token이 없으면 장바구니 조회를 발화하지 않고 배지도 없다', async () => {
    // 비로그인 홈 진입에서 인증 필요 API가 나가면 401 → refresh 실패 → 전역 로그인 이동으로 튕긴다.
    // 목록(/carts)과 배지 집계(/carts/items/count) 둘 다 센다 — 배지 경로가 바뀌어도 이 단언이
    // 조용히 통과하지 않게 한다.
    let cartRequestCount = 0
    const onRequest = ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname
      if (request.method === 'GET' && (path.endsWith('/carts') || path.endsWith('/carts/items/count'))) {
        cartRequestCount += 1
      }
    }
    server.events.on('request:start', onRequest)

    renderAt('/')
    await screen.findByText('이런 상품은 어때요?')

    expect(cartRequestCount).toBe(0)
    expect(screen.queryByLabelText(/장바구니 \(/)).not.toBeInTheDocument()
    server.events.removeListener('request:start', onRequest)
  })

  it('[AC-CART-BADGE-002] 배지는 담긴 수량 합계가 아니라 품목 종류 수를 보여준다', async () => {
    setAccessToken('badge-test-token')
    renderAt('/')

    // 시드는 2종 5개다. 배지는 종류 수인 2여야 하고 수량 합계인 5가 아니다.
    expect(await screen.findByLabelText('장바구니 (2)')).toBeInTheDocument()
    expect(screen.queryByLabelText('장바구니 (5)')).not.toBeInTheDocument()
  })

  it('[AC-CART-BADGE-003] 배지는 목록 조회가 아니라 전용 집계 경로를 쓴다', async () => {
    // 배지만 필요한 홈이 장바구니 전체를 받으면 분리한 이유가 없어진다.
    const paths: string[] = []
    const onRequest = ({ request }: { request: Request }) => {
      if (request.method === 'GET') paths.push(new URL(request.url).pathname)
    }
    server.events.on('request:start', onRequest)

    setAccessToken('badge-test-token')
    renderAt('/')
    await screen.findByLabelText('장바구니 (2)')

    expect(paths.some(p => p.endsWith('/carts/items/count'))).toBe(true)
    expect(paths.some(p => p.endsWith('/carts'))).toBe(false)
    server.events.removeListener('request:start', onRequest)
  })
})

describe('/ (추천 상품 캐러셀)', () => {
  beforeEach(() => {
    resetWishlist()
    resetAuth()
  })

  it('[AC-HOME-013] 캐러셀이 추천 상품을 보여주고 카드 탭이 상세로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/')

    // 섹션 헤더는 비개인화 문구("이런 상품은 어때요?")
    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
    // 랭킹에 없는 추천 전용 상품(쿨매트)이 캐러셀에 렌더된다 → 추천이 별개 큐레이션임을 확인
    const card = await screen.findByRole('button', { name: '여름 쿨매트 젤 방석 L 상세 보기' })

    // 카드 탭 → 상품 상세로 실제 이동(장식 아님)
    await user.click(card)
    expect(await screen.findByText('상품 정보')).toBeInTheDocument()
    // 홈에서 벗어남 — 홈 앱바('애착')는 더 이상 보이지 않는다
    expect(screen.queryByText('애착')).not.toBeInTheDocument()
  })

  it('[AC-HOME-014] 비회원이 캐러셀 하트를 누르면 게이트가 뜨고 찜은 토글되지 않는다', async () => {
    const user = userEvent.setup()
    logout()
    renderAt('/')

    // 캐러셀 하트(미찜 상품 = "찜하기")를 찾는다
    const hearts = await screen.findAllByRole('button', { name: '찜하기' })
    const initialCount = hearts.length
    expect(initialCount).toBeGreaterThan(0)

    await user.click(hearts[0]!)

    // 게이트가 뜨고, 찜은 그대로(토글 안 됨) — "찜하기" 개수가 유지된다
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '찜하기' })).toHaveLength(initialCount)
  })
})

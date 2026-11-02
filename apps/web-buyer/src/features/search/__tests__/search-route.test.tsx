import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken, setOnAuthExpired, type ProductSummaryResponse } from '@aechak/api'
import { resetWishlist } from '@/shared/catalog'
import { resetAuth } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'
import { SEARCH_KEYWORDS_URL, SEARCH_PRODUCTS_URL, server } from '@/testing/msw/server'

// 반환 타입을 명시해 필수 필드 누락을 tsc가 잡게 한다 — 예전엔 타입 주석이 없어 `isLiked`(SCRUM-190에서
// required로 승격)가 빠진 채 서버가 줄 수 없는 카드 응답을 흉내내고 있었다. 찜 상태가 필요한 케이스는
// 호출부에서 `{ ...product(...), isLiked: true }`로 덮어쓴다.
function product(productId: string, name: string): ProductSummaryResponse {
  return {
    productId,
    name,
    sellerName: '테스트상점',
    thumbnailImageKey: null,
    regularPrice: 10000,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: 4.5,
    reviewCount: 10,
    isLiked: false,
    isViewable: true,
    isPurchasable: true,
  }
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

describe('/search', () => {
  // 최근·추천 검색어(GET /search/keywords)는 회원 전용이다. 랜딩 자체는 비회원도 열려야 하므로
  // 회원 전제 케이스는 토큰으로 로그인시키고, 비회원 케이스는 토큰 없이 둔다.
  beforeEach(() => setAccessToken('member-token'))

  it('[AC-SEARCH-015] 세션이 끊긴 회원의 최근 검색어 401은 전역 로그인 이동을 일으키지 않는다', async () => {
    const onAuthExpired = vi.fn()
    let requested = false
    setOnAuthExpired(onAuthExpired)
    server.use(
      http.get(SEARCH_KEYWORDS_URL, () => {
        requested = true
        return HttpResponse.json({ message: 'unauthorized' }, { status: 401 })
      }),
    )

    renderAt('/search')
    await waitFor(() => expect(requested).toBe(true))
    expect(onAuthExpired).not.toHaveBeenCalled()
    setOnAuthExpired(null)
  })

  it('[AC-SEARCH-018] 비회원은 최근 검색어를 아예 조회하지 않고 로그인 안내를 본다', async () => {
    resetAuth()
    let requested = 0
    server.use(
      http.get(SEARCH_KEYWORDS_URL, () => {
        requested += 1
        return HttpResponse.json({ data: { recentKeywords: [], recommendedKeywords: [] } })
      }),
    )

    renderAt('/search')

    // 저장되지 않는 비회원에게 "여기에 표시돼요"라고 적으면 저장될 것처럼 읽힌다.
    expect(await screen.findByText('로그인하면 최근 검색어를 저장해 드려요')).toBeInTheDocument()
    expect(requested).toBe(0)
    // 비어 있는 추천 섹션은 제목만 남은 빈 칸이라 접는다.
    expect(screen.queryByText('추천 검색어')).not.toBeInTheDocument()
  })

  it('[AC-SEARCH-006] 전체 삭제를 누르면 최근 검색어가 비고 빈 상태가 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/search')

    await user.click(await screen.findByText('전체 삭제'))

    expect(await screen.findByText('최근 검색한 상품이 여기에 표시돼요')).toBeInTheDocument()
  })

  it('[AC-SEARCH-012] 최근 검색어 단건 삭제 후 서버 재조회에도 삭제 상태가 유지된다', async () => {
    const user = userEvent.setup()
    renderAt('/search')

    await user.click(await screen.findByRole('button', { name: '츄르 삭제' }))

    expect(await screen.findByText('자동 급식기')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '츄르 삭제' })).not.toBeInTheDocument()
  })

  it('[AC-SEARCH-007] 검색어를 탭하면 검색 결과 화면으로 이동해 매칭 상품이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/search')

    await user.click(await screen.findByRole('button', { name: '츄르' }))

    expect(await screen.findByText('츄르 참치맛 40개입')).toBeInTheDocument()
  })
})

describe('/search/results', () => {
  it('[AC-SEARCH-017] 빈 검색어 직접 진입은 무한 스켈레톤 대신 검색 랜딩으로 돌려보낸다', async () => {
    renderAt('/search/results')

    expect(await screen.findByText('최근 검색어')).toBeInTheDocument()
  })

  it('[AC-SEARCH-016] 기본 전체 가격은 maxPrice를 전송하지 않아 고가 상품을 누락시키지 않는다', async () => {
    let maxPrice: string | null | undefined
    server.use(
      http.get(SEARCH_PRODUCTS_URL, ({ request }) => {
        maxPrice = new URL(request.url).searchParams.get('maxPrice')
        return HttpResponse.json({
          data: { products: [], totalCount: 0, nextCursor: null, hasNext: false },
        })
      }),
    )
    renderAt('/search/results?q=고가')

    await screen.findByText(/검색 결과가 없어요/)
    expect(maxPrice).toBeNull()
  })

  it('[AC-SEARCH-013] 커서 다음 페이지를 기존 상품 뒤에 누적한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(SEARCH_PRODUCTS_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        return HttpResponse.json({
          data: cursor
            ? {
                products: [product('page-2', '두 번째 페이지 상품')],
                totalCount: null,
                nextCursor: null,
                hasNext: false,
              }
            : {
                products: [product('page-1', '첫 번째 페이지 상품')],
                totalCount: 2,
                nextCursor: 'next',
                hasNext: true,
              },
        })
      }),
    )
    renderAt('/search/results?q=페이지')

    expect(await screen.findByText('첫 번째 페이지 상품')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '상품 더 보기' }))

    expect(await screen.findByText('두 번째 페이지 상품')).toBeInTheDocument()
    expect(screen.getByText('첫 번째 페이지 상품')).toBeInTheDocument()
  })

  it('[AC-SEARCH-014] 다음 페이지 실패 시 기존 상품을 보존하고 인라인 재시도를 제공한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(SEARCH_PRODUCTS_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (cursor) return HttpResponse.json({ message: 'failed' }, { status: 500 })
        return HttpResponse.json({
          data: {
            products: [product('page-1', '보존되어야 하는 상품')],
            totalCount: 2,
            nextCursor: 'next',
            hasNext: true,
          },
        })
      }),
    )
    renderAt('/search/results?q=페이지')

    expect(await screen.findByText('보존되어야 하는 상품')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '상품 더 보기' }))

    expect(await screen.findByText('다음 상품을 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.getByText('보존되어야 하는 상품')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-SEARCH-008] 품절 제외 칩을 끄면 품절 상품이 결과에 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=스크래쳐')

    // 기본 품절 제외(on) — 품절 상품만 매칭돼 결과가 없다.
    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument()

    // 품절 제외 칩을 눌러 끄면 품절 상품이 결과에 나타난다.
    await user.click(screen.getByRole('button', { name: '품절 제외' }))
    expect(await screen.findByText('스크래쳐 하우스 2종 세트')).toBeInTheDocument()
  })

  it('[AC-SEARCH-010] 품절 제외 칩이 기본 ON(aria-pressed)으로 렌더된다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=급식기')

    // 결과 로드 확인 후 칩 상태 검사.
    expect(await screen.findByText('스테인리스 급식기 타이머형')).toBeInTheDocument()

    const chip = screen.getByRole('button', { name: '품절 제외' })
    // 기본값 excludeSoldOut: true → 활성(aria-pressed=true)으로 렌더.
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    // 끄면 비활성으로 바뀐다(토글 동작 보존).
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('[AC-SEARCH-011] 결과 없음 화면이 따옴표 없이 검색어를 강조해 보여준다', async () => {
    renderAt('/search/results?q=존재하지않는상품zz')

    const heading = await screen.findByText(/검색 결과가 없어요/)
    // 검색어는 (마크업 강조로) 화면에 함께 노출된다.
    expect(screen.getByText('존재하지않는상품zz')).toBeInTheDocument()
    // 곡선/직선 따옴표 문자가 없어야 한다(카피 관례: 직접 인용부호 금지).
    expect(heading.parentElement?.textContent ?? '').not.toMatch(/['"‘’“”]/)
  })

  it('[AC-SEARCH-018] 이전에 찜한 상품은 검색 결과 첫 렌더부터 하트가 채워진다', async () => {
    // 전역 afterEach는 미러(store)를 리셋하지 않으므로 이 테스트에서 격리한다.
    resetWishlist()
    server.use(
      http.get(SEARCH_PRODUCTS_URL, () =>
        HttpResponse.json({
          data: {
            products: [
              { ...product('liked-1', '찜한 사료'), isLiked: true },
              { ...product('plain-1', '안 찜한 사료'), isLiked: false },
            ],
            totalCount: 2,
            nextCursor: null,
            hasNext: false,
          },
        }),
      ),
    )
    renderAt('/search/results?q=사료')

    expect(await screen.findByText('찜한 사료')).toBeInTheDocument()
    // liked-1은 isLiked=true라 fetch 시점 미러 시드로 첫 렌더부터 '찜 해제'(채워짐).
    expect(await screen.findByRole('button', { name: '찜 해제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '찜하기' })).toBeInTheDocument()
  })

  it('[AC-SEARCH-009] 가격 칩은 전체 필터 시트가 아니라 가격대 전용 시트를 열고 프리셋이 결과에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=급식기')

    // 결과 로드 확인.
    expect(await screen.findByText('스테인리스 급식기 타이머형')).toBeInTheDocument()

    // 가격 칩 → 가격대 전용 시트(전체 필터 시트의 '최소 평점' 섹션은 열리지 않음).
    await user.click(screen.getByRole('button', { name: '가격' }))
    expect(await screen.findByText('가격대')).toBeInTheDocument()
    expect(screen.queryByText('최소 평점')).not.toBeInTheDocument()

    // '3만원 이하' 프리셋 선택 → 모든 급식기(최저 45,000원)가 빠져 결과가 없다.
    await user.click(screen.getByRole('button', { name: '3만원 이하' }))
    expect(await screen.findByText(/검색 결과가 없어요/)).toBeInTheDocument()
  })
})

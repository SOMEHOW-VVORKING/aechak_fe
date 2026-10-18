import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import type { UnreviewedOrderItemResponse, WrittenReviewItemResponse } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'
import { MY_REVIEWS_URL, REVIEW_DETAIL_URL, REVIEWS_URL, server } from '@/testing/msw/server'
import { getReviews, removeReview, resetReviews } from '@/shared/review'
import { resetAccount } from '@/shared/account'

// 내 리뷰(GET /users/me/reviews) 실 HTTP 경로. BE MyReviewListResponse 계약 그대로 응답한다
// (be: boot/api/.../review/response/MyReviewListResponse.kt).

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const unreviewed = (over: Partial<UnreviewedOrderItemResponse> = {}): UnreviewedOrderItemResponse => ({
  type: 'UNREVIEWED',
  orderItemId: 501,
  optionName: '2kg / 연어',
  productPublicId: '01J0000000000000000000SRV1',
  productName: '서버 주문 연어 사료',
  productThumbnailUrl: 'https://media-dev.aechak.co.kr/products/salmon.jpg',
  purchaseConfirmedAt: '2026-09-20T09:30:00',
  reviewableUntil: '2026-10-20',
  canReview: true,
  ...over,
})

const written = (over: Partial<WrittenReviewItemResponse> = {}): WrittenReviewItemResponse => ({
  type: 'WRITTEN',
  reviewId: 701,
  rating: 4,
  content: '서버에 저장된 내 리뷰 본문이에요.',
  reviewStatus: 'PUBLIC',
  optionName: '1kg / 닭고기',
  productPublicId: '01J0000000000000000000SRV2',
  productName: '서버 주문 닭고기 간식',
  productThumbnailUrl: null,
  createdAt: '2026-09-25T12:00:00',
  images: [],
  ...over,
})

interface Page {
  items: (WrittenReviewItemResponse | UnreviewedOrderItemResponse)[]
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}

const page = (items: Page['items'], over: Partial<Page> = {}): Page => ({
  items,
  totalCount: items.length,
  nextCursor: null,
  hasNext: false,
  ...over,
})

/** 탭별 첫 페이지를 고정으로 내려준다. 요청 파라미터는 calls에 남긴다. */
function serveTabs(tabs: { unreviewed?: Page; written?: Page }) {
  const calls: URLSearchParams[] = []
  server.use(
    http.get(MY_REVIEWS_URL, ({ request }) => {
      const params = new URL(request.url).searchParams
      calls.push(params)
      const tab = params.get('tab') as 'unreviewed' | 'written'
      return HttpResponse.json({ data: tabs[tab] ?? page([]) })
    }),
  )
  return calls
}

/** 로컬 시드 리뷰를 비워 서버 응답만 보이게 한다. */
function clearMockData() {
  for (const review of getReviews()) removeReview(review.id)
}

describe('내 리뷰 서버 연동', () => {
  beforeEach(() => {
    resetReviews()
    resetAccount()
  })

  it('[AC-MY-REVIEW-001] 두 탭을 서버 목록으로 그리고 작성 대기는 서버 항목만, 작성 완료는 로컬 시드 리뷰를 더한다', async () => {
    const calls = serveTabs({
      unreviewed: page([unreviewed()], { totalCount: 1 }),
      written: page([written()], { totalCount: 1 }),
    })
    const user = userEvent.setup()
    renderAt('/reviews/mine')

    // 작성 대기는 서버 1(목업 주문 스토어 폐기로 로컬 파생 없음), 작성 완료는 서버 1 + 로컬 시드 리뷰 2.
    expect(await screen.findByText('작성 대기 1')).toBeInTheDocument()
    expect(await screen.findByText('작성 완료 3')).toBeInTheDocument()
    expect(screen.getByText('서버 주문 연어 사료')).toBeInTheDocument()
    expect(screen.getByText('구매확정 09.20 / 10.20까지 작성')).toBeInTheDocument()
    expect(calls.map(c => c.get('tab')).sort()).toEqual(['unreviewed', 'written'])
    expect(calls.every(c => c.get('size') === '20' && !c.has('cursor'))).toBe(true)

    await user.click(await screen.findByRole('tab', { name: '작성 완료 3' }))
    expect(await screen.findByText('서버에 저장된 내 리뷰 본문이에요.')).toBeInTheDocument()
    expect(screen.getByText('서버 주문 닭고기 간식')).toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-002] 서버와 목업 모두 비면 탭마다 빈 안내를 보여준다', async () => {
    clearMockData()
    serveTabs({})
    const user = userEvent.setup()
    renderAt('/reviews/mine')

    expect(await screen.findByText('작성 대기 0')).toBeInTheDocument()
    expect(screen.getByText('작성할 리뷰가 없어요')).toBeInTheDocument()
    await user.click(await screen.findByRole('tab', { name: '작성 완료 0' }))
    expect(await screen.findByText('작성한 리뷰가 없어요')).toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-003] 첫 페이지가 실패(500)하면 목업으로 채우지 않고 재시도 버튼 없이 안내한다', async () => {
    server.use(http.get(MY_REVIEWS_URL, () => new HttpResponse(null, { status: 500 })))
    renderAt('/reviews/mine')

    expect(await screen.findByText('리뷰 목록을 불러오지 못했어요')).toBeInTheDocument()
    // 개수를 모르니 라벨에 숫자를 붙이지 않는다.
    expect(screen.getByText('작성 대기')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /다시/ })).not.toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-004] 작성 기한이 지난 항목(canReview=false)은 리뷰 쓰기 대신 만료를 안내한다', async () => {
    clearMockData()
    serveTabs({ unreviewed: page([unreviewed({ canReview: false, reviewableUntil: '2026-08-01' })]) })
    renderAt('/reviews/mine')

    expect(await screen.findByText('작성 기간이 지났어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '리뷰 쓰기' })).not.toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-005] 서버 작성 대기에서 쓴 리뷰는 orderItemId로 저장되고 돌아오면 두 탭에 바로 반영된다', async () => {
    clearMockData()
    let saved = false
    let posted: { orderItemId?: number } | null = null
    server.use(
      http.get(MY_REVIEWS_URL, ({ request }) => {
        const tab = new URL(request.url).searchParams.get('tab')
        if (tab === 'unreviewed') return HttpResponse.json({ data: page(saved ? [] : [unreviewed()]) })
        return HttpResponse.json({
          data: page(
            saved
              ? [written({ reviewId: 902, content: '연어 사료를 아주 잘 먹어요.', productName: '서버 주문 연어 사료' })]
              : [],
          ),
        })
      }),
      http.post(REVIEWS_URL, async ({ request }) => {
        posted = (await request.json()) as { orderItemId: number }
        saved = true
        return HttpResponse.json(
          {
            data: {
              reviewId: 902,
              productId: 1,
              rating: 5,
              content: '연어 사료를 아주 잘 먹어요.',
              optionName: '2kg / 연어',
              createdAt: '2026-10-01T10:00:00',
              images: [],
            },
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    const router = renderAt('/reviews/mine')

    await user.click(await screen.findByRole('button', { name: '리뷰 쓰기' }))
    // 상품명은 작성 대기 카드에도 있어 작성 화면 전환을 먼저 기다린다(안 그러면 떠나는 카드를 잡는다).
    await screen.findByText('상품은 만족하셨나요?')
    // 작성 화면은 내 리뷰가 넘긴 주문 시점 스냅샷(상품명/옵션)을 그린다.
    expect(await screen.findByText('서버 주문 연어 사료')).toBeInTheDocument()
    expect(screen.getByText('2kg / 연어')).toBeInTheDocument()
    const stars = screen.getAllByRole('radio')
    await user.click(stars[stars.length - 1]!)
    await user.type(screen.getByRole('textbox'), '연어 사료를 아주 잘 먹어요.')
    await user.click(screen.getByRole('button', { name: '리뷰 등록' }))

    await waitFor(() => expect(posted).toEqual(expect.objectContaining({ orderItemId: 501 })))
    await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/mine'))
    // 이전 캐시(작성 대기 1/작성 완료 0)를 보여주지 않고 새 목록으로 그린다.
    expect(await screen.findByText('연어 사료를 아주 잘 먹어요.')).toBeInTheDocument()
    expect(screen.getByText('작성 대기 0')).toBeInTheDocument()
    expect(screen.getByText('작성 완료 1')).toBeInTheDocument()
    expect(screen.queryByText('작성 대기 1')).not.toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-006] 서버 리뷰는 수정 없이 삭제만 노출하고 삭제하면 재조회 전에 목록과 개수에서 빠진다', async () => {
    clearMockData()
    let deletedId: string | null = null
    serveTabs({ written: page([written(), written({ reviewId: 702, content: '두 번째 리뷰예요.' })]) })
    server.use(
      http.delete(REVIEW_DETAIL_URL, ({ params }) => {
        deletedId = String(params.reviewId)
        // 삭제 뒤 재조회는 끝나지 않게 둔다. 캐시에서 바로 빠지는지만 본다.
        server.use(http.get(MY_REVIEWS_URL, () => new Promise<never>(() => {})))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/reviews/mine')

    await user.click(await screen.findByRole('tab', { name: '작성 완료 2' }))
    const card = (await screen.findByText('서버에 저장된 내 리뷰 본문이에요.')).closest('div.rounded-card') as HTMLElement
    expect(within(card).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    await waitFor(() => expect(deletedId).toBe('701'))
    await waitFor(() =>
      expect(screen.queryByText('서버에 저장된 내 리뷰 본문이에요.')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('두 번째 리뷰예요.')).toBeInTheDocument()
    expect(screen.getByText('작성 완료 1')).toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-007] 마스킹/차단/숨김 리뷰는 기획 문구로 가려짐/블라인드를 안내한다', async () => {
    clearMockData()
    serveTabs({
      written: page([
        written({ reviewId: 801, reviewStatus: 'MASKED', content: '포장이 ***해서 아쉬워요.' }),
        written({ reviewId: 802, reviewStatus: 'BLOCKED', content: '차단된 원문' }),
        written({ reviewId: 803, reviewStatus: 'HIDDEN', content: '숨겨진 원문' }),
      ]),
    })
    const user = userEvent.setup()
    renderAt('/reviews/mine')

    await user.click(await screen.findByRole('tab', { name: '작성 완료 3' }))
    expect(await screen.findByText('커뮤니티 정책에 따라 일부 표현이 가려졌어요.')).toBeInTheDocument()
    expect(screen.getByText('포장이 ***해서 아쉬워요.')).toBeInTheDocument()
    expect(
      screen.getByText('정책 위반 표현이 포함되어 블라인드됐어요. 다른 구매자에게는 보이지 않아요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('커뮤니티 정책에 따라 블라인드 처리됐어요. 다른 구매자에게는 보이지 않아요.'),
    ).toBeInTheDocument()
  })

  it('[AC-MY-REVIEW-008] 더보기는 nextCursor로 다음 페이지를 이어 붙이고, 커서 오류(400)면 받은 목록을 유지한다', async () => {
    clearMockData()
    const cursors: (string | null)[] = []
    let failNext = false
    server.use(
      http.get(MY_REVIEWS_URL, ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('tab') !== 'written') return HttpResponse.json({ data: page([]) })
        const cursor = params.get('cursor')
        cursors.push(cursor)
        if (cursor == null) {
          return HttpResponse.json({
            data: page([written()], { totalCount: 3, nextCursor: 'bXc6MTo3MDE', hasNext: true }),
          })
        }
        if (failNext) {
          return HttpResponse.json({ errorCode: 90002, message: '유효하지 않은 커서입니다.' }, { status: 400 })
        }
        return HttpResponse.json({
          data: page([written({ reviewId: 650, content: '다음 페이지 리뷰예요.' })], {
            totalCount: null,
            nextCursor: 'bXc6MTo2NTA',
            hasNext: true,
          }),
        })
      }),
    )
    const user = userEvent.setup()
    renderAt('/reviews/mine')

    await user.click(await screen.findByRole('tab', { name: '작성 완료 3' }))
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    expect(await screen.findByText('다음 페이지 리뷰예요.')).toBeInTheDocument()
    expect(cursors).toEqual([null, 'bXc6MTo3MDE'])

    failNext = true
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await waitFor(() => expect(cursors).toHaveLength(3))
    expect(screen.getByText('서버에 저장된 내 리뷰 본문이에요.')).toBeInTheDocument()
    expect(screen.getByText('다음 페이지 리뷰예요.')).toBeInTheDocument()
    expect(screen.queryByText('리뷰 목록을 불러오지 못했어요')).not.toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  MY_REVIEWS_URL,
  PRODUCT_REVIEWS_URL,
  REAL_PRODUCT_ID,
  REVIEW_DETAIL_URL,
  REVIEWS_URL,
  server,
} from '@/testing/msw/server'
import { getReviews, resetReviews } from '@/shared/review'
import { resetAccount } from '@/shared/account'

function renderAt(path: string) {
  return renderHistory([path])
}

function renderHistory(entries: string[]) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: entries }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 내 리뷰 작성 대기(서버 orderItemId 77)에서 넘어오는 작성 화면 URL — 주문 시점 스냅샷을 search로 받는다.
const SERVER_WRITE_URL =
  '/reviews/write?productId=p-leash-5m&orderItemId=77&productName=' +
  encodeURIComponent('자동 리드줄 5m 대형견용') +
  '&option=' +
  encodeURIComponent('5m / 블랙')

describe('리뷰 라우트', () => {
  beforeEach(() => {
    resetReviews()
    resetAccount()
  })

  it('[AC-REVIEW-ROUTE-001] /reviews/mine은 대기/완료 탭과 개수를 렌더한다', async () => {
    // 작성 대기는 서버 목록(기본 핸들러 빈 목록)뿐이고, 작성 완료는 로컬 시드 리뷰 2건.
    renderAt('/reviews/mine')
    expect(await screen.findByText('작성 대기 0')).toBeInTheDocument()
    expect(await screen.findByText('작성 완료 2')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-002] /reviews/write는 작성 대기 스냅샷의 상품과 별점 입력을 렌더한다', async () => {
    renderAt(SERVER_WRITE_URL)
    expect(await screen.findByText('상품은 만족하셨나요?')).toBeInTheDocument()
    expect(await screen.findByText('자동 리드줄 5m 대형견용')).toBeInTheDocument()
    expect(screen.getByText('5m / 블랙')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-003] /reviews/product/$productId는 리뷰 요약과 목록을 렌더한다', async () => {
    renderAt('/reviews/product/p-feeder-5l')
    expect(await screen.findByText('집사**')).toBeInTheDocument()
    // 리뷰 '구매' 인증 pill 제거(소비측에서 verifiedPurchase 미전달)
    expect(screen.queryByText('구매')).not.toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-005] 리뷰 사진을 탭하면 확대 뷰어(라이트박스)가 열린다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews/product/p-feeder-5l')
    await screen.findByText('집사**')

    const photoButtons = await screen.findAllByRole('button', { name: /리뷰 사진 \d+ 확대 보기/ })
    expect(screen.queryByRole('dialog', { name: '리뷰 사진 확대 보기' })).not.toBeInTheDocument()

    await user.click(photoButtons[0]!)
    expect(
      await screen.findByRole('dialog', { name: '리뷰 사진 확대 보기' }),
    ).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-006] 상품 리뷰 목록에서 내 리뷰는 닉네임 + 수정/삭제로 뜬다', async () => {
    // 시드 리뷰 rv-seed-1(author: 나)이 p-feeder-5l 목록에 얹힌다 → 작성자는 '나'가 아니라
    // 내 계정 닉네임(코코집사)으로 표기되고, 그 카드에만 수정/삭제 버튼이 붙는다.
    renderAt('/reviews/product/p-feeder-5l')
    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.queryByText('나')).not.toBeInTheDocument()
    // 다른 구매자 목업 리뷰는 그대로(닉네임 유지, 수정/삭제 없음).
    expect(screen.getByText('집사**')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-007] 상품 리뷰 목록에서 내 리뷰를 삭제하면 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews/product/p-feeder-5l')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    // 확인 모달 → 삭제하기
    expect(await screen.findByText('리뷰를 삭제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    // 내 리뷰가 목록에서 사라진다(닉네임/수정·삭제 버튼 제거). 다른 리뷰는 유지.
    await waitFor(() => expect(screen.queryByText('코코집사')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.getByText('집사**')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-008] 실 상품은 리뷰 목록 API의 요약/리뷰를 렌더한다', async () => {
    // REAL_PRODUCT_ID는 MSW가 실 리뷰(5건)를 내려준다 — 최신순(id 내림) 첫 리뷰는 505(냥집사).
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    expect(await screen.findByText('냥집사')).toBeInTheDocument()
    expect(screen.getByText('집사7**')).toBeInTheDocument()
    // 요약 평균 (2+5+3+4+5)/5 = 3.8
    expect(screen.getByText('3.8')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-009] 포토리뷰만 토글은 사진 없는 리뷰를 감춘다', async () => {
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    // 사진 없는 리뷰(멍토끼=502)가 처음엔 보인다.
    expect(await screen.findByText('멍토끼')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '포토리뷰만' }))
    // 서버가 photoOnly로 다시 걸러 사진 없는 리뷰는 사라지고, 사진 있는 리뷰(냥집사=505)는 남는다.
    await waitFor(() => expect(screen.queryByText('멍토끼')).not.toBeInTheDocument())
    expect(screen.getByText('냥집사')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-012] 포토리뷰만이면 헤더 개수도 필터된 개수(totalCount)를 따른다', async () => {
    // 요약 카드는 전체(5건)를 유지하되, 헤더 "리뷰 N"은 목록과 어긋나지 않게 필터 개수를 따라간다.
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    expect(await screen.findByText('리뷰 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '포토리뷰만' }))
    // 사진 리뷰 3건 → 헤더도 3으로 갱신.
    expect(await screen.findByText('리뷰 3')).toBeInTheDocument()
    expect(screen.queryByText('리뷰 5')).not.toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-010] 별점높은순 정렬은 서버에 반영되어 순서가 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    // 최신순: 505(냥집사, ★2)가 504(하늘**, ★5)보다 위.
    const nyang = await screen.findByText('냥집사')
    const haneul = screen.getByText('하늘**')
    expect(nyang.compareDocumentPosition(haneul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '별점높은순' }))
    // 별점높은순: 504(★5)가 505(★2)보다 위로 올라온다.
    await waitFor(() => {
      const a = screen.getByText('하늘**')
      const b = screen.getByText('냥집사')
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('[AC-REVIEW-ROUTE-011] 더보기를 누르면 다음 페이지 리뷰가 이어 붙는다', async () => {
    // 서버가 2페이지로 나눠 주도록 핸들러를 덮어쓴다(기본 픽스처는 5건이라 한 페이지에 다 들어감).
    server.use(
      http.get(PRODUCT_REVIEWS_URL, ({ params, request }) => {
        if (params.productId !== REAL_PRODUCT_ID) return new HttpResponse(null, { status: 404 })
        const first = new URL(request.url).searchParams.get('cursor') == null
        return HttpResponse.json({
          data: first
            ? {
                summary: {
                  reviewCount: 2,
                  averageRating: 4.5,
                  ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
                },
                reviews: [
                  {
                    reviewId: 901,
                    rating: 5,
                    content: '첫 페이지 리뷰예요.',
                    optionName: '기본형',
                    authorNickname: '첫페이지어',
                    authorProfileImageUrl: null,
                    createdAt: '2026-08-11T09:00:00',
                    images: [],
                  },
                ],
                totalCount: 2,
                nextCursor: '1',
                hasNext: true,
              }
            : {
                summary: null,
                reviews: [
                  {
                    reviewId: 902,
                    rating: 4,
                    content: '둘째 페이지 리뷰예요.',
                    optionName: '기본형',
                    authorNickname: '둘째페이지어',
                    authorProfileImageUrl: null,
                    createdAt: '2026-08-10T09:00:00',
                    images: [],
                  },
                ],
                totalCount: null,
                nextCursor: null,
                hasNext: false,
              },
        })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    expect(await screen.findByText('첫페이지어')).toBeInTheDocument()
    expect(screen.queryByText('둘째페이지어')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByText('둘째페이지어')).toBeInTheDocument()
    // 첫 페이지 리뷰는 그대로 남고 이어 붙는다.
    expect(screen.getByText('첫페이지어')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-013] 정렬 토글 요청이 실패하면 이전 목록을 조용히 유지하지 않고 에러로 안내한다', async () => {
    // 최신순(첫 로드)은 200, 별점높은순은 500으로 응답하도록 덮어쓴다.
    server.use(
      http.get(PRODUCT_REVIEWS_URL, ({ params, request }) => {
        if (params.productId !== REAL_PRODUCT_ID) return new HttpResponse(null, { status: 404 })
        const sort = new URL(request.url).searchParams.get('sort') ?? 'latest'
        if (sort === 'rating_desc') return new HttpResponse(null, { status: 500 })
        return HttpResponse.json({
          data: {
            summary: {
              reviewCount: 1,
              averageRating: 5,
              ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
            },
            reviews: [
              {
                reviewId: 701,
                rating: 5,
                content: '정렬 실패 회귀 테스트용 리뷰예요.',
                optionName: '기본형',
                authorNickname: '정렬테스터',
                authorProfileImageUrl: null,
                createdAt: '2026-08-11T09:00:00',
                images: [],
              },
            ],
            totalCount: 1,
            nextCursor: null,
            hasNext: false,
          },
        })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    expect(await screen.findByText('정렬테스터')).toBeInTheDocument()

    // 별점높은순 요청이 500 → placeholderData가 든 이전 목록을 조용히 남기지 않고 에러로 전환한다.
    // (이 회귀 테스트는 isError && !data 조건에서는 stale 목록이 그대로 남아 실패한다.)
    await user.click(screen.getByRole('button', { name: '별점높은순' }))
    expect(await screen.findByText('리뷰를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText('정렬테스터')).not.toBeInTheDocument()
  })

  // 서버가 내려준 "내 리뷰" 한 건짜리 목록으로 갈아끼운다 — 기본 픽스처는 전부 isMine=false라
  // 내 리뷰 카드(닉네임 + 액션)를 지나가지 않는다.
  function serveMyServerReview(reviewId: number) {
    server.use(
      http.get(PRODUCT_REVIEWS_URL, () =>
        HttpResponse.json({
          data: {
            summary: { reviewCount: 1, averageRating: 5, ratingDistribution: { '5': 1 } },
            reviews: [
              {
                reviewId,
                isMine: true,
                rating: 5,
                content: '서버에 저장된 내 리뷰예요.',
                optionName: '기본형',
                authorNickname: '코코집사',
                authorProfileImageUrl: null,
                createdAt: '2026-08-20T10:00:00',
                images: [],
              },
            ],
            totalCount: 1,
            nextCursor: null,
            hasNext: false,
          },
        }),
      ),
    )
  }

  it('[AC-REVIEW-ROUTE-014] 서버 리뷰(isMine)에는 수정 버튼을 노출하지 않는다', async () => {
    // 수정은 서버 API가 없어 로컬 스토어 리뷰에서만 가능하다 — 서버 리뷰에 버튼을 두면 작성 화면이
    // 대상을 못 찾아 "리뷰할 상품을 찾을 수 없어요"로 빠지는 죽은 진입이 된다.
    serveMyServerReview(321)
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    expect(await screen.findByText('서버에 저장된 내 리뷰예요.')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-015] 정렬 전환이 실패하면 기본 필터로 되돌릴 길을 준다', async () => {
    // 에러 화면에는 정렬 칩이 없어(칩이 본문 안에 있다) 사용자가 이전 필터로 돌아갈 수단이 없었다.
    server.use(
      http.get(PRODUCT_REVIEWS_URL, ({ request }) => {
        if (new URL(request.url).searchParams.get('sort') === 'rating_desc') {
          return HttpResponse.json({ message: 'error' }, { status: 500 })
        }
        return HttpResponse.json({
          data: {
            summary: { reviewCount: 1, averageRating: 5, ratingDistribution: { '5': 1 } },
            reviews: [
              {
                reviewId: 1,
                isMine: false,
                rating: 5,
                content: '최신순에서만 보이는 리뷰예요.',
                optionName: '기본형',
                authorNickname: '집사하나',
                authorProfileImageUrl: null,
                createdAt: '2026-08-20T10:00:00',
                images: [],
              },
            ],
            totalCount: 1,
            nextCursor: null,
            hasNext: false,
          },
        })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    await screen.findByText('최신순에서만 보이는 리뷰예요.')

    await user.click(screen.getByRole('button', { name: '별점높은순' }))
    expect(await screen.findByText('리뷰를 불러오지 못했어요')).toBeInTheDocument()

    // 되돌리기를 누르면 캐시된 최신순 목록이 다시 뜬다.
    await user.click(screen.getByRole('button', { name: '최신순으로 보기' }))
    expect(await screen.findByText('최신순에서만 보이는 리뷰예요.')).toBeInTheDocument()
  })

  async function writeReview(content: string) {
    const user = userEvent.setup()
    await screen.findByText('상품은 만족하셨나요?')
    // 별점 입력은 radio 5개(1~5점) — 마지막이 5점이다.
    const stars = screen.getAllByRole('radio')
    await user.click(stars[stars.length - 1]!)
    await user.type(screen.getByRole('textbox'), content)
    await user.click(screen.getByRole('button', { name: '리뷰 등록' }))
    return user
  }

  it('[AC-REVIEW-WRITE-001] 실 주문(orderItemId 보유)의 리뷰는 서버에 저장되고 내 리뷰는 서버 목록으로 보인다', async () => {
    let posted: { orderItemId?: number; rating?: number } | null = null
    server.use(
      // 저장 전에는 비어 있고 저장 뒤에는 그 리뷰를 내려주는 written 탭.
      http.get(MY_REVIEWS_URL, ({ request }) => {
        const written = new URL(request.url).searchParams.get('tab') === 'written' && posted != null
        const items = written
          ? [
              {
                type: 'WRITTEN',
                reviewId: 977,
                rating: 5,
                content: '서버가 확정한 본문이에요.',
                reviewStatus: 'PUBLIC',
                optionName: '5m / 블랙',
                productPublicId: 'p-leash-5m',
                productName: '자동 리드줄 5m 대형견용',
                productThumbnailUrl: null,
                createdAt: '2026-08-21T10:00:00',
                images: [],
              },
            ]
          : []
        return HttpResponse.json({
          data: { items, totalCount: items.length, nextCursor: null, hasNext: false },
        })
      }),
      http.post(REVIEWS_URL, async ({ request }) => {
        posted = (await request.json()) as { orderItemId: number; rating: number }
        return HttpResponse.json(
          {
            data: {
              reviewId: 977,
              productId: 1,
              rating: posted.rating,
              content: '서버가 확정한 본문이에요.',
              optionName: '5m / 블랙',
              createdAt: '2026-08-21T10:00:00',
              images: [],
            },
          },
          { status: 201 },
        )
      }),
    )
    const router = renderAt(SERVER_WRITE_URL)
    await writeReview('배송도 빠르고 튼튼해서 만족스러워요.')

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted!.orderItemId).toBe(77)
    expect(posted!.rating).toBe(5)
    await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/mine'))
    // 작성 완료 탭은 서버 written 목록을 그린다. 서버 리뷰는 로컬 스토어에 따로 쌓지 않는다.
    expect(await screen.findByText('서버가 확정한 본문이에요.')).toBeInTheDocument()
    expect(getReviews().some(r => r.id === 'srv-977')).toBe(false)
  })

  it('[AC-REVIEW-WRITE-005] 주문 품목 id 없이 진입하면 작성 폼 대신 안내를 보여주고 로컬에도 남기지 않는다', async () => {
    // 실 주문 품목에는 orderItemId가 있어야 서버에 저장된다 — 없으면 저장되지 않는 리뷰를 성공처럼 보일 수 없다.
    const user = userEvent.setup()
    const router = renderAt('/reviews/write?productId=p-leash-5m&orderId=20260703-0098')

    expect(await screen.findByText('리뷰를 쓸 주문을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('상품은 만족하셨나요?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '리뷰 등록' })).not.toBeInTheDocument()
    expect(getReviews().some(r => r.id === 'rv-20260703-0098-p-leash-5m')).toBe(false)

    await user.click(screen.getByRole('button', { name: '내 리뷰로' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/reviews/mine'))
  })

  it('[AC-REVIEW-WRITE-004] 공백만 쓴 본문은 등록할 수 없고 앞뒤 공백은 잘라서 보낸다', async () => {
    let posted: { content?: string } | null = null
    server.use(
      http.post(REVIEWS_URL, async ({ request }) => {
        posted = (await request.json()) as { content: string }
        return HttpResponse.json(
          {
            data: {
              reviewId: 978,
              productId: 1,
              rating: 5,
              content: posted.content,
              optionName: '5m / 블랙',
              createdAt: '2026-08-21T10:00:00',
              images: [],
            },
          },
          { status: 201 },
        )
      }),
    )
    renderAt(SERVER_WRITE_URL)
    const user = userEvent.setup()
    await screen.findByText('상품은 만족하셨나요?')
    const stars = screen.getAllByRole('radio')
    await user.click(stars[stars.length - 1]!)
    // BE @Size는 공백 10자도 통과시키므로 화면이 잘라낸 본문으로 최소 길이를 본다.
    await user.type(screen.getByRole('textbox'), '          ')
    expect(screen.getByRole('button', { name: '리뷰 등록' })).toBeDisabled()

    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '  산책할 때 아주 잘 쓰고 있어요  ')
    await user.click(screen.getByRole('button', { name: '리뷰 등록' }))
    await waitFor(() => expect(posted?.content).toBe('산책할 때 아주 잘 쓰고 있어요'))
  })

  it('[AC-REVIEW-WRITE-003] 이미 리뷰를 쓴 주문(409)은 화면에 사유를 안내한다', async () => {
    server.use(
      http.post(REVIEWS_URL, () =>
        HttpResponse.json({ errorCode: 110004, message: '이미 리뷰를 작성한 주문입니다.' }, { status: 409 }),
      ),
    )
    const router = renderAt(SERVER_WRITE_URL)
    await writeReview('이미 쓴 주문이라 실패해야 해요.')

    expect(await screen.findByText('이미 리뷰를 쓴 주문이에요.')).toBeInTheDocument()
    // 실패했으니 이동하지 않고 작성 화면에 머문다.
    expect(router.state.location.pathname).toBe('/reviews/write')
  })
  it('[AC-REVIEW-DELETE-001] 서버 리뷰를 삭제하면 DELETE를 호출하고 목록에서 사라진다', async () => {
    serveMyServerReview(321)
    let deletedId: string | null = null
    server.use(
      http.delete(REVIEW_DETAIL_URL, ({ params }) => {
        deletedId = String(params.reviewId)
        // 삭제 후 재조회는 빈 목록을 준다(무효화가 실제로 목록을 갱신하는지 확인하기 위함).
        server.use(
          http.get(PRODUCT_REVIEWS_URL, () =>
            HttpResponse.json({
              data: {
                summary: { reviewCount: 0, averageRating: null, ratingDistribution: {} },
                reviews: [],
                totalCount: 0,
                nextCursor: null,
                hasNext: false,
              },
            }),
          ),
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    await screen.findByText('서버에 저장된 내 리뷰예요.')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    await waitFor(() => expect(deletedId).toBe('321'))
    await waitFor(() =>
      expect(screen.queryByText('서버에 저장된 내 리뷰예요.')).not.toBeInTheDocument(),
    )
  })

  it('[AC-REVIEW-DELETE-004] 삭제 성공 직후 재조회를 기다리지 않고 목록에서 빠진다', async () => {
    // 서버 리뷰는 로컬 스토어에 없어 removeReview가 no-op이라, 캐시에서 직접 빼지 않으면
    // "삭제했어요" 토스트가 뜬 뒤에도 재조회가 끝날 때까지 카드가 남는다.
    serveMyServerReview(555)
    // 재조회를 붙잡아 두는 게이트 — 이 상태에서도 카드가 사라져야 한다.
    let releaseRefetch = () => {}
    const refetchGate = new Promise<void>(resolve => {
      releaseRefetch = resolve
    })
    server.use(
      http.delete(REVIEW_DETAIL_URL, () => {
        server.use(
          http.get(PRODUCT_REVIEWS_URL, async () => {
            await refetchGate
            return HttpResponse.json({
              data: {
                summary: { reviewCount: 0, averageRating: null, ratingDistribution: {} },
                reviews: [],
                totalCount: 0,
                nextCursor: null,
                hasNext: false,
              },
            })
          }),
        )
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    await screen.findByText('서버에 저장된 내 리뷰예요.')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    await waitFor(() =>
      expect(screen.queryByText('서버에 저장된 내 리뷰예요.')).not.toBeInTheDocument(),
    )
    releaseRefetch()
  })

  it('[AC-REVIEW-DELETE-002] 목업 리뷰 삭제는 서버를 부르지 않는다', async () => {
    let called = 0
    server.use(
      http.delete(REVIEW_DETAIL_URL, () => {
        called += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/reviews/mine')
    await screen.findByText('작성 완료 2')
    await user.click(screen.getByText('작성 완료 2'))

    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]!)
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    expect(await screen.findByText('리뷰를 삭제했어요.')).toBeInTheDocument()
    expect(called).toBe(0)
  })

  it('[AC-REVIEW-DELETE-003] 남의 리뷰 삭제(403)는 사유를 알리고 리뷰를 남긴다', async () => {
    serveMyServerReview(654)
    server.use(
      http.delete(REVIEW_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 110003, message: '본인 리뷰만 삭제할 수 있습니다.' }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    renderAt(`/reviews/product/${REAL_PRODUCT_ID}`)
    await screen.findByText('서버에 저장된 내 리뷰예요.')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    expect(await screen.findByText('본인이 쓴 리뷰만 삭제할 수 있어요.')).toBeInTheDocument()
    expect(screen.getByText('서버에 저장된 내 리뷰예요.')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-004] 리뷰 수정 완료 후 뒤로가기는 수정 화면을 재진입하지 않는다(replace)', async () => {
    const user = userEvent.setup()
    // 내 리뷰 목록 위에서 시드 리뷰(rv-seed-1) 수정 화면으로 진입한 세션.
    const router = renderHistory(['/reviews/mine', '/reviews/write?reviewId=rv-seed-1'])

    // 수정 화면(별점 프리필로 '리뷰 수정' 즉시 활성)이 뜬다.
    expect(await screen.findByText('상품은 만족하셨나요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '리뷰 수정' }))

    // 저장 완료 → 내 리뷰(완료 탭)로 이동.
    expect(await screen.findByText('작성 완료 2', {}, { timeout: 3000 })).toBeInTheDocument()

    // 뒤로가기 → 수정 화면을 replace로 빠져나왔으니 그 이전(내 리뷰)로 가야 한다.
    router.history.back()
    expect(await screen.findByText('작성 대기 0')).toBeInTheDocument()
    expect(screen.queryByText('상품은 만족하셨나요?')).not.toBeInTheDocument()
  })
})

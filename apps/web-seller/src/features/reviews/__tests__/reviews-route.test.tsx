import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  currentSellerReviews,
  failSellerReviewsList,
  lastSellerReviewsListQuery,
  makeSellerProductWire,
  seedSellerProducts,
  seedSellerReviews,
  type SellerReviewWire,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081) /sellers/me/reviews 네 경로를 가로챈다. 모듈 모킹이 아니라
// 네트워크 레벨이라 URL·호스트·envelope·에러 계약까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
function renderReviews() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/reviews'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

const FEEDER_ID = '01JSELLERPRODUCT0000000001'
const TOWER_ID = '01JSELLERPRODUCT0000000002'

const cardOf = async (productName: string) =>
  (await screen.findByText(productName)).closest('li') as HTMLElement

const reviewById = (reviewId: number) =>
  currentSellerReviews().find(row => row.reviewId === reviewId)!

beforeEach(() => {
  seedSellerReviews()
  seedSellerProducts([
    { product: makeSellerProductWire({ productId: FEEDER_ID, name: '자동 급식기 5L' }) },
    { product: makeSellerProductWire({ productId: TOWER_ID, name: '원목 캣타워 3단' }) },
  ])
})

describe('셀러 리뷰 목록', () => {
  it('[AC-SELLER-REVIEW-101] 서버 리뷰를 상품명·별점 분포·답글 상태와 함께 보여준다', async () => {
    renderReviews()

    // 분포 요약 — 3건 중 5/4/2점 한 건씩이라 평균 3.7
    expect(await screen.findByText('3.7')).toBeInTheDocument()
    expect(screen.getByText('리뷰 3건')).toBeInTheDocument()

    const answered = await cardOf('사이즈표보다 작게 나왔어요.')
    expect(within(answered).getByText('답글 완료')).toBeInTheDocument()
    expect(within(answered).getByText('사이즈표를 실측값으로 다시 올렸어요.')).toBeInTheDocument()

    const unanswered = await cardOf('조립은 혼자서 30분쯤 걸렸어요.')
    expect(within(unanswered).getByText('답글 없음')).toBeInTheDocument()

    // 사진 리뷰는 장수 배지로만 알린다(썸네일을 깔지 않는다)
    const photo = await cardOf('출근이 늦어지는 날에도 정해진 시간에 밥이 나와서 마음이 놓여요.')
    expect(within(photo).getByText('사진 2장')).toBeInTheDocument()
  })

  it('[AC-SELLER-REVIEW-102] 답글 없는 건수 카드는 서버 총건수를 쓴다', async () => {
    renderReviews()

    // 세운 3건 중 답글 없는 것은 2건
    expect(await screen.findByText('2건')).toBeInTheDocument()
  })

  it("[AC-SELLER-REVIEW-103] '전체' 필터는 쿼리에서 키째 빠진다", async () => {
    renderReviews()
    await screen.findByText('리뷰 3건')

    // 빈 값을 그대로 보내면 서버가 400(90001)을 준다 — 쿼리에 그 키가 없어야 한다
    const query = lastSellerReviewsListQuery() ?? ''
    expect(query).not.toContain('productId=')
    expect(query).not.toContain('rating=')
    expect(query).not.toContain('hasReply=')
    expect(query).toContain('size=20')
  })

  it('[AC-SELLER-REVIEW-104] 답글 없음 필터는 hasReply=false로 나가고 목록이 좁혀진다', async () => {
    renderReviews()
    await screen.findByText('리뷰 3건')

    await userEvent.selectOptions(screen.getByLabelText('답글 여부'), 'NONE')

    await waitFor(() => expect(lastSellerReviewsListQuery()).toContain('hasReply=false'))
    await waitFor(() =>
      expect(screen.queryByText('사이즈표보다 작게 나왔어요.')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('조립은 혼자서 30분쯤 걸렸어요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-REVIEW-105] 별점 필터는 목록만 좁히고 분포 막대는 상품 범위 전체를 유지한다', async () => {
    renderReviews()
    await screen.findByText('리뷰 3건')

    await userEvent.selectOptions(screen.getByLabelText('별점'), '5')

    await waitFor(() => expect(lastSellerReviewsListQuery()).toContain('rating=5'))
    await waitFor(() => expect(screen.getByText('총 1건')).toBeInTheDocument())
    // 요약은 별점 필터를 반영하지 않는다 — 막대가 지금 고른 별점만 남으면 분포가 아니다
    expect(screen.getByText('리뷰 3건')).toBeInTheDocument()
  })

  it('[AC-SELLER-REVIEW-106] 상품 필터는 상품 목록에서 선택지를 받고 그 상품만 남긴다', async () => {
    renderReviews()
    await screen.findByText('리뷰 3건')

    // 선택지는 리뷰가 아니라 내 상품 목록에서 온다 — 리뷰에서 뽑으면 필터를 거는 순간 선택지가 줄어든다
    await userEvent.selectOptions(screen.getByLabelText('상품'), TOWER_ID)

    await waitFor(() => expect(lastSellerReviewsListQuery()).toContain(`productId=${TOWER_ID}`))
    await waitFor(() => expect(screen.getByText('리뷰 1건')).toBeInTheDocument())
    expect(
      screen.queryByText('출근이 늦어지는 날에도 정해진 시간에 밥이 나와서 마음이 놓여요.'),
    ).not.toBeInTheDocument()
  })

  it('[AC-SELLER-REVIEW-107] 더 보기로 다음 커서 페이지를 이어 붙인다', async () => {
    const many: SellerReviewWire[] = Array.from({ length: 25 }, (_, index) => ({
      reviewId: 2000 + index,
      productId: FEEDER_ID,
      productName: '자동 급식기 5L',
      rating: 5,
      content: `리뷰 본문 ${index}`,
      optionName: '기본',
      authorNickname: '코코',
      createdAt: '2026-10-26T10:00:00',
      images: [],
      reply: null,
    }))
    seedSellerReviews(many)
    renderReviews()

    await screen.findByText('리뷰 본문 0')
    expect(screen.queryByText('리뷰 본문 20')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '더 보기' }))

    expect(await screen.findByText('리뷰 본문 24')).toBeInTheDocument()
    // 첫 페이지의 요약·총건수는 뒤 페이지의 null로 덮이지 않는다
    expect(screen.getByText('총 25건')).toBeInTheDocument()
    expect(screen.getByText('리뷰 25건')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-REVIEW-108] 목록 조회 실패는 빈 상태가 아니라 오류 안내로 드러나고 답글 처리를 잠근다', async () => {
    failSellerReviewsList({ status: 403, errorCode: 110011, message: '리뷰를 조회할 수 없습니다.' })
    renderReviews()

    expect(await screen.findByText(/판매 활동이 가능한 계정만/)).toBeInTheDocument()
    // "조건에 맞는 리뷰가 없어요"로 떨어지면 셀러가 필터를 의심한다
    expect(screen.getByText('조건에 맞는 리뷰가 없어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  })
})

describe('셀러 답글', () => {
  it('[AC-SELLER-REVIEW-201] 답글을 등록하면 서버에 저장되고 목록 배지가 답글 완료로 바뀐다', async () => {
    renderReviews()
    const card = await cardOf('조립은 혼자서 30분쯤 걸렸어요.')

    await userEvent.click(within(card).getByRole('button', { name: '답글 쓰기' }))
    await userEvent.type(screen.getByLabelText(/셀러 답글/), '설명서 그림을 키워서 다시 넣었어요.')
    await userEvent.click(screen.getByRole('button', { name: '답글 등록' }))

    expect(await screen.findByText('답글을 등록했어요.')).toBeInTheDocument()
    // 토스트만 보고 끝내지 않는다 — 서버 상태가 실제로 바뀌었는지 본다
    expect(reviewById(1176).reply?.content).toBe('설명서 그림을 키워서 다시 넣었어요.')
    const updated = await cardOf('조립은 혼자서 30분쯤 걸렸어요.')
    await waitFor(() => expect(within(updated).getByText('답글 완료')).toBeInTheDocument())
  })

  it('[AC-SELLER-REVIEW-202] 답글이 있는 리뷰는 수정 버튼이 기존 내용을 채우고 PUT으로 바꾼다', async () => {
    renderReviews()
    const card = await cardOf('사이즈표보다 작게 나왔어요.')

    await userEvent.click(within(card).getByRole('button', { name: '답글 수정' }))
    const textarea = screen.getByLabelText(/셀러 답글/)
    expect(textarea).toHaveValue('사이즈표를 실측값으로 다시 올렸어요.')

    await userEvent.clear(textarea)
    await userEvent.type(textarea, '사이즈표를 고치고 교환도 바로 처리했어요.')
    await userEvent.click(screen.getByRole('button', { name: '답글 수정' }))

    expect(await screen.findByText('답글을 수정했어요.')).toBeInTheDocument()
    expect(reviewById(1171).reply?.content).toBe('사이즈표를 고치고 교환도 바로 처리했어요.')
    // 수정이라 답글 행이 늘지 않는다(replyId 유지)
    expect(reviewById(1171).reply?.replyId).toBe(9001)
  })

  it('[AC-SELLER-REVIEW-203] 답글을 지우면 서버에서 사라지고 다시 쓸 수 있다', async () => {
    renderReviews()
    const card = await cardOf('사이즈표보다 작게 나왔어요.')

    await userEvent.click(within(card).getByRole('button', { name: '답글 삭제' }))

    expect(await screen.findByText('답글을 지웠어요.')).toBeInTheDocument()
    expect(reviewById(1171).reply).toBeNull()
    const cleared = await cardOf('사이즈표보다 작게 나왔어요.')
    await waitFor(() => expect(within(cleared).getByText('답글 없음')).toBeInTheDocument())
  })

  it('[AC-SELLER-REVIEW-204] 이미 답글이 있는 리뷰에 등록하면 409 문구가 뜨고 기존 답글이 남는다', async () => {
    // 화면이 든 행이 낡은 경우 — 다른 탭에서 먼저 답글을 단 상황을 서버 상태로 재현한다
    renderReviews()
    const card = await cardOf('조립은 혼자서 30분쯤 걸렸어요.')
    await userEvent.click(within(card).getByRole('button', { name: '답글 쓰기' }))
    currentSellerReviews()
    const rows = currentSellerReviews()
    seedSellerReviews(
      rows.map(row =>
        row.reviewId === 1176
          ? {
              ...row,
              reply: {
                replyId: 9500,
                reviewId: 1176,
                content: '다른 탭에서 먼저 쓴 답글',
                repliedAt: '2026-10-27T10:00:00',
                updatedAt: '2026-10-27T10:00:00',
              },
            }
          : row,
      ),
    )

    await userEvent.type(screen.getByLabelText(/셀러 답글/), '나중에 쓴 답글')
    await userEvent.click(screen.getByRole('button', { name: '답글 등록' }))

    expect(await screen.findByText(/이미 답글이 있어요/)).toBeInTheDocument()
    // 거절이 기존 답글을 덮지 않았는지까지 본다
    expect(reviewById(1176).reply?.content).toBe('다른 탭에서 먼저 쓴 답글')
  })

  it('[AC-SELLER-REVIEW-205] 공백뿐인 답글은 보내지 않는다', async () => {
    renderReviews()
    const card = await cardOf('조립은 혼자서 30분쯤 걸렸어요.')

    await userEvent.click(within(card).getByRole('button', { name: '답글 쓰기' }))
    await userEvent.type(screen.getByLabelText(/셀러 답글/), '   ')

    expect(screen.getByRole('button', { name: '답글 등록' })).toBeDisabled()
    expect(reviewById(1176).reply).toBeNull()
  })
})

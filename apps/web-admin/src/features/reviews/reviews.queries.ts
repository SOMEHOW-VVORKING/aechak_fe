import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  blindAdminReview,
  deleteAdminReview,
  getAdminReviewDetail,
  getAdminReviews,
  unblindAdminReview,
  type AdminReviewDetailData,
  type AdminReviewListData,
  type GetAdminReviewsParams,
} from '@aechak/api'
import {
  reviewStatusToWire,
  toReviewDetailView,
  toReviewRow,
  type AdminReviewDetailView,
  type AdminReviewRow,
  type ReviewStatusValue,
  type SelectableBlindReason,
} from './reviews.map'

// 어드민 리뷰 관리 5종(목록·상세·블라인드·해제·삭제)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비한다(AGENTS 6-2).

export const REVIEWS_QUERY_KEY = ['admin-reviews'] as const

/** 서버 기본값과 같은 페이지 크기. 1~100 밖이면 서버가 400을 준다(절삭하지 않는다). */
export const DEFAULT_PAGE_SIZE = 20

export interface ReviewListParams {
  status: ReviewStatusValue | 'all'
  /** 서버는 **정확한 별점 하나**만 받는다 — 1~2점 같은 구간 필터는 계약에 없다. */
  rating: number | 'all'
  /** true면 신고가 쌓인 행만. 상태와 직교하는 축이다. */
  reportedOnly: boolean
  /** 리뷰 본문·상품명 부분일치. 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  size?: number
}

function listParams(params: ReviewListParams, cursor?: string): GetAdminReviewsParams {
  const keyword = params.keyword.trim()
  return {
    ...(params.status === 'all' ? {} : { status: reviewStatusToWire(params.status) }),
    ...(params.rating === 'all' ? {} : { rating: params.rating }),
    // reported=false는 "전체"와 같은 뜻이라(서버가 Boolean.TRUE.equals로 본다) 키째 뺀다.
    ...(params.reportedOnly ? { reported: true } : {}),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface ReviewListResult {
  rows: AdminReviewRow[]
  totalCount: number | null
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록. 커서에 **필터 지문**이 실려 있어 조건이 바뀐 채 옛 커서를 보내면 서버가
 * 400(90002)으로 끊는다 — 필터를 쿼리 키에 넣어 조건이 바뀌는 순간 커서 사슬을 새로 시작한다.
 *
 * 더 보기는 `query.hasNextPage`로만 열고 **응답 본문의 `hasNext`로 열지 않는다**. placeholder
 * 구간에는 `data`가 이전 조건의 페이지라서, 본문 값을 읽으면 버튼이 열려 있고 그 버튼이 옛 커서를
 * 요구해 400으로 끊긴다(운영자에게는 목록이 깨진 것으로 보인다). `isPlaceholderData`를 함께 보는
 * 것은 react-query의 파생 성질에 기대지 않겠다는 뜻이고, 계약은 테스트가 고정한다.
 * 실패는 행을 지우지 않고 `isError`로 알려 화면이 처리 버튼을 잠그게 한다(AGENTS 6-7).
 */
export function useAdminReviews(params: ReviewListParams): ReviewListResult {
  const query = useInfiniteQuery<AdminReviewListData>({
    queryKey: [...REVIEWS_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminReviews(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toReviewRow)),
    totalCount: pages[0]?.totalCount ?? null,
    hasNext: query.hasNextPage && !query.isPlaceholderData && !query.isError,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

export interface ReviewDetailResult {
  review: AdminReviewDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useAdminReviewDetail(reviewId: number | null): ReviewDetailResult {
  const query = useQuery<AdminReviewDetailData>({
    queryKey: [...REVIEWS_QUERY_KEY, 'detail', reviewId],
    queryFn:
      reviewId == null
        ? skipToken
        : ({ signal }) => getAdminReviewDetail(reviewId, signal).then(response => response.data),
  })
  return {
    review: query.data ? toReviewDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export type ReviewDecision = 'blind' | 'unblind' | 'delete'

export interface ReviewWriteInput {
  reviewId: number
  decision: ReviewDecision
  /** 블라인드·삭제에만 쓴다. 해제는 사유를 받지 않는다(요청 본문 자체가 없다). */
  reasonCode: SelectableBlindReason | null
  reasonText: string
}

/**
 * 블라인드·해제·삭제. 셋 다 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
 * 실패해도 무효화하는 이유는 409(이미 블라인드·블라인드 아님)와 400(이미 삭제)이 전부 "화면이
 * 낡았다"는 신호라, 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useWriteReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReviewWriteInput) => {
      if (input.decision === 'unblind') {
        return unblindAdminReview(input.reviewId)
      }
      if (input.reasonCode == null) {
        // 사유는 블라인드·삭제의 필수 입력이다 — 화면이 막지만 요청을 만들 수 있는 자리에서도 끊는다.
        return Promise.reject(new Error('처리 사유를 선택해 주세요.'))
      }
      const body = {
        reasonCode: input.reasonCode,
        ...(input.reasonText.trim() === '' ? {} : { reasonText: input.reasonText.trim() }),
      }
      return input.decision === 'blind'
        ? blindAdminReview(input.reviewId, body)
        : deleteAdminReview(input.reviewId, body)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: REVIEWS_QUERY_KEY }),
  })
}

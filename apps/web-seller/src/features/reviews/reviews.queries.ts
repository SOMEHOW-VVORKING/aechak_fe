import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteSellerReviewReply,
  editSellerReviewReply,
  getSellerProducts,
  getSellerReviews,
  writeSellerReviewReply,
} from '@aechak/api'
import type { SellerReview, SellerReviewListData, SellerReviewSummary } from './reviews.contract'
import { normalizeReviewSearchParams, type SellerReviewSearchInput } from './reviews.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(claims·products 관례) 이 파일이 자체
// useInfiniteQuery/useMutation으로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로
// 여기서 벗기고, 204 경로(답글 삭제)는 본문이 없어 벗길 것이 없다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

// 목록·답글 없는 건수 집계가 이 접두를 공유한다 — 답글을 쓰면 접두 무효화 한 번으로 목록, 지표
// 카드, 분포 요약까지 갱신된다(main.tsx staleTime 60초라 무효화가 필수). 필터 Select가 쓰는 상품
// 목록은 답글에 흔들리지 않으므로 이 접두 밖에 둔다.
export const REVIEWS_QUERY_KEY = ['reviews'] as const

const PAGE_SIZE = 20

export interface SellerReviewsView {
  reviews: SellerReview[]
  /** 첫 페이지에만 실리는 별점 분포 요약. 별점·답글 필터를 반영하지 않는다(막대는 상품 범위 전체). */
  summary: SellerReviewSummary | null
  /** 현재 필터를 반영한 총건수 — 첫 페이지에만 실린다. */
  totalCount: number | null
}

/**
 * 목록. 서버가 커서 페이지네이션이라 `useInfiniteQuery`로 감싸고 화면은 "더 보기"로 이어 붙인다.
 *
 * `nextCursor`가 null이면 `getNextPageParam`이 undefined를 돌려 더 불러오지 않는다. 커서에는 셀러와
 * 필터 셋이 함께 담겨 있어 필터를 바꾼 뒤 이전 커서를 쓰면 서버가 400(90002)을 주는데, 필터가
 * queryKey에 들어 있어 필터가 바뀌면 커서 체인 자체가 새로 시작되므로 그 경로로 들어가지 않는다.
 */
export const useSellerReviews = (input: SellerReviewSearchInput) => {
  // 정규화한 값으로 키를 만든다 — `{ rating: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const params = normalizeReviewSearchParams(input)
  const query = useInfiniteQuery({
    queryKey: [...REVIEWS_QUERY_KEY, 'list', params],
    queryFn: ({ pageParam, signal }) =>
      getSellerReviews(
        { ...params, size: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ).then(response => response.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: SellerReviewListData) => lastPage.nextCursor ?? undefined,
  })

  const pages = query.data?.pages ?? []
  const view: SellerReviewsView = {
    reviews: pages.flatMap(page => page.reviews),
    // 요약·총건수는 첫 페이지에만 실린다 — 뒤 페이지의 null로 덮어쓰지 않는다.
    summary: pages[0]?.summary ?? null,
    totalCount: pages[0]?.totalCount ?? null,
  }
  return { ...query, view }
}

/**
 * "답글 없는 리뷰" 건수. 서버에 전용 집계가 없어 같은 목록 경로를 답글 없음 필터로 한 건만 불러
 * `totalCount`를 읽는다 — 목록이 이미 내는 숫자라 새 계약을 만들지 않는다.
 *
 * 상품 필터는 함께 적용한다. 지금 보고 있는 범위와 다른 숫자를 카드에 띄우면 목록과 어긋난다.
 */
export const useUnansweredReviewCount = (input: Pick<SellerReviewSearchInput, 'productId'>) => {
  const params = {
    ...normalizeReviewSearchParams({ productId: input.productId }),
    hasReply: false,
    size: 1,
  }
  return useQuery({
    queryKey: [...REVIEWS_QUERY_KEY, 'unanswered-count', params],
    queryFn: ({ signal }) =>
      getSellerReviews(params, signal).then(response => response.data.totalCount),
  })
}

/**
 * 상품 필터 선택지. 리뷰 목록 응답에는 리뷰가 달린 상품만 나오므로 Select를 리뷰에서 뽑으면
 * 필터를 거는 순간 선택지가 한 개로 줄어든다. 그래서 내 상품 목록을 따로 부른다.
 *
 * 첫 페이지 100건까지만 쓴다 — 상품이 그보다 많은 셀러에게는 선택지가 모자라므로, 그때는 상품
 * 관리에서 넘어오는 진입점이 필요하다(지금 화면에는 없다).
 */
export const PRODUCT_OPTION_LIMIT = 100

export const useReviewProductOptions = () =>
  useQuery({
    // 답글 무효화 접두(REVIEWS_QUERY_KEY) 밖에 둔다 — 답글을 쓸 때마다 상품 목록까지 다시 부를 이유가 없다.
    queryKey: ['review-product-options'],
    queryFn: ({ signal }) =>
      getSellerProducts({ page: 0, size: PRODUCT_OPTION_LIMIT }, signal).then(response =>
        response.data.products.map(product => ({ value: product.productId, label: product.name })),
      ),
  })

function useReplyMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    // 목록 행의 답글, 답글 여부 필터 결과, 지표 카드가 한 번에 바뀐다.
    //
    // **실패도 무효화한다**(onSuccess가 아니라 onSettled인 이유). 답글 쓰기 실패의 상당수가
    // "화면이 든 행이 낡았다"는 뜻이다 — 409/110201(이미 답글이 있음), 404/110200(답글이 사라짐),
    // 404/110000(리뷰가 비노출로 바뀜)은 모두 서버 쪽이 이미 움직인 경우다. 성공만 무효화하면
    // 그 행이 낡은 상태로 남아 같은 버튼이 다시 눌리고 같은 실패를 반복한다.
    onSettled: () => queryClient.invalidateQueries({ queryKey: REVIEWS_QUERY_KEY }),
  })
}

export interface ReviewReplyVariables {
  reviewId: number
  content: string
}

export const useWriteReviewReply = () =>
  useReplyMutation(({ reviewId, content }: ReviewReplyVariables) =>
    writeSellerReviewReply(reviewId, { content }).then(response => response.data),
  )

export const useEditReviewReply = () =>
  useReplyMutation(({ reviewId, content }: ReviewReplyVariables) =>
    editSellerReviewReply(reviewId, { content }).then(response => response.data),
  )

export const useDeleteReviewReply = () =>
  useReplyMutation(({ reviewId }: { reviewId: number }) => deleteSellerReviewReply(reviewId))

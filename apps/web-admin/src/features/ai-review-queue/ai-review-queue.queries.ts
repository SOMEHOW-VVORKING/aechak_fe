import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAdminProductInspection,
  getAdminProductInspectionDetail,
  getAdminProductInspections,
  rejectAdminProductInspection,
  type AdminProductInspectionListData,
  type GetAdminProductInspectionsParams,
} from '@aechak/api'
import {
  toAiReviewDetail,
  toAiReviewRow,
  type QueueStatus,
} from './ai-review-queue.map'

// 어드민 상품 검토 큐 넷(목록, 상세, 승인, 반려)을 실서버에 붙이는 어댑터. 생성된 react-query 훅이 아니라
// fetcher만 소비한다(AGENTS 규약). 결정 한 번의 무효화가 목록과 열린 상세를 함께 갱신하도록 접두를 공유한다.

export const AI_REVIEW_QUEUE_QUERY_KEY = ['products', 'ai-review-queue'] as const

/** 서버 기본값과 같은 페이지 크기(BE PageQuery). */
export const DEFAULT_PAGE_SIZE = 20

export interface AiReviewListParams {
  /** null이면 status 파라미터 자체를 보내지 않는다(전체 조회). */
  status: QueueStatus | null
  page: number
}

function listParams({ status, page }: AiReviewListParams): GetAdminProductInspectionsParams {
  return { ...(status ? { status } : {}), page, size: DEFAULT_PAGE_SIZE }
}

export function useAiReviewQueue(params: AiReviewListParams) {
  const query = useQuery<AdminProductInspectionListData>({
    queryKey: [...AI_REVIEW_QUEUE_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) => getAdminProductInspections(listParams(params), signal).then(response => response.data),
    placeholderData: keepPreviousData,
  })
  return {
    rows: (query.data?.items ?? []).map(toAiReviewRow),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useAiReviewDetail(productId: string | null) {
  const query = useQuery({
    queryKey: [...AI_REVIEW_QUEUE_QUERY_KEY, 'detail', productId],
    queryFn:
      productId == null
        ? skipToken
        : ({ signal }) => getAdminProductInspectionDetail(productId, signal).then(response => response.data),
  })
  return {
    detail: query.data ? toAiReviewDetail(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export type AiReviewDecision = 'approve' | 'reject'

export interface AiReviewDecisionInput {
  productId: string
  decision: AiReviewDecision
  /** 반려일 때만 쓴다. 셀러에게 그대로 보인다. */
  reason?: string
}

/**
 * 승인·반려. 둘 다 204라 무효화 후 재조회로 반영한다. 실패해도 무효화하는 이유는 409가 화면이
 * 낡았다는 신호라 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useDecideAiReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, decision, reason }: AiReviewDecisionInput) =>
      decision === 'approve'
        ? approveAdminProductInspection(productId)
        : rejectAdminProductInspection(productId, { reason: reason ?? '' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_REVIEW_QUEUE_QUERY_KEY }),
  })
}

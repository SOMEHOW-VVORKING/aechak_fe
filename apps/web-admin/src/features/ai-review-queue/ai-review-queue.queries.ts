import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAdminProductInspection,
  getAdminProductInspectionDetail,
  getAdminProductInspections,
  rejectAdminProductInspection,
  ReviewQueueStatus,
  type AdminProductInspectionListData,
  type GetAdminProductInspectionsParams,
} from '@aechak/api'
import { useMetricValue } from '@/shared/hooks/useMetricValue'
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
  /** 켜면 이의제기된 상품만 받는다. */
  appealedOnly: boolean
  page: number
}

/**
 * 끄면 `appealed` 자체를 보내지 않는다. 서버 기본값이 false라 같은 요청이고, **false의 뜻을
 * 확인하지 못했기 때문이다** — false가 "이의 없는 것만"이면 전체 조회가 조용히 줄어든다.
 */
function listParams({ status, appealedOnly, page }: AiReviewListParams): GetAdminProductInspectionsParams {
  return {
    ...(status ? { status } : {}),
    ...(appealedOnly ? { appealed: true } : {}),
    page,
    size: DEFAULT_PAGE_SIZE,
  }
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

/**
 * 관리자 확인을 기다리는 검수 건수. 대시보드 첫 화면의 `검수 대기 상품` 칸과 할 일 줄이 쓴다.
 *
 * `size=1`로 받고 `totalCount`만 읽는다 — 목록 길이로 세면 늘 1이다. 이 화면의 기본 탭과 같은
 * 모수(`PENDING_REVIEW`)이지만 **키를 따로 쓴다**: 목록 키에는 page·size가 실려 있어 거기 끼면
 * 화면이 1건짜리 페이지를 그리게 된다.
 */
export function usePendingInspectionCount(): number | null {
  const params: GetAdminProductInspectionsParams = {
    status: ReviewQueueStatus.PENDING_REVIEW,
    page: 0,
    size: 1,
  }
  return useMetricValue([...AI_REVIEW_QUEUE_QUERY_KEY, 'pending-count'], signal =>
    getAdminProductInspections(params, signal).then(response => response.data.totalCount),
  )
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

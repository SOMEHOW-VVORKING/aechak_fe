import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AdminReviewState,
  approveAdminContentInspection,
  getAdminContentInspectionDetail,
  getAdminContentInspections,
  rejectAdminContentInspection,
  type AdminInspectionDetailData,
  type AdminInspectionListData,
  type AdminReviewReason,
  type GetAdminContentInspectionsParams,
  type InspectionTargetType,
} from '@aechak/api'
import {
  collectViolations,
  toPipelineStages,
  toQueueRow,
  type InspectionDecision,
  type PipelinePerspectiveRow,
  type PipelineStageView,
  type QueueRowView,
} from './ai-review-queue.map'

// AI 검수 큐 4종(목록·상세·허용·차단)을 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이
// 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다(AGENTS 규약).
// 캐시 키 접두를 공유해 결정 한 번의 무효화가 목록·대기 수·열린 상세까지 함께 갱신한다.

export const AI_REVIEW_QUEUE_QUERY_KEY = ['products', 'ai-review-queue'] as const

/** 서버 기본값과 같은 페이지 크기(BE PageQuery). 서버는 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

export interface QueueListParams {
  /** null이면 state 파라미터 자체를 보내지 않는다(OPEN·RESOLVED 전체). */
  state: AdminReviewState | null
  /** null이면 reason 파라미터 자체를 보내지 않는다(전체). */
  reason: AdminReviewReason | null
  targetType?: InspectionTargetType | null
  page: number
  size?: number
}

export interface QueueListResult {
  rows: QueueRowView[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
}

// 값이 빈 파라미터는 키째 빼서 보낸다(AGENTS 6-6) — 서버가 미입력이 아니라 형식 오류로 읽는
// 자리가 있어서다. 정규화는 이 층이 맡고 라우트는 null만 넘긴다.
function listParams({
  state,
  reason,
  targetType,
  page,
  size,
}: QueueListParams): GetAdminContentInspectionsParams {
  return {
    ...(state ? { state } : {}),
    ...(reason ? { reason } : {}),
    ...(targetType ? { targetType } : {}),
    page,
    size: size ?? DEFAULT_PAGE_SIZE,
  }
}

/** 오프셋 페이지네이션 목록(커서가 아니다). page 음수·범위 밖 size는 서버가 보정한다. */
export function useAiReviewQueue(params: QueueListParams): QueueListResult {
  const query = useQuery<AdminInspectionListData>({
    queryKey: [...AI_REVIEW_QUEUE_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) =>
      getAdminContentInspections(listParams(params), signal).then(response => response.data),
    // 필터·페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  return {
    rows: (query.data?.items ?? []).map(toQueueRow),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * 처리 대기 건수. 목록의 totalCount는 현재 필터 기준이라 "대기 N"을 만들 수 없어 OPEN만 세는
 * 1건짜리 조회를 따로 둔다(심사 대기 배지와 같은 패턴). 실패하거나 권한이 없으면 null이고
 * 그때는 배지를 아예 그리지 않는다 — 틀린 숫자를 띄우지 않는다.
 */
export function useOpenInspectionCount(): number | null {
  const query = useQuery({
    queryKey: [...AI_REVIEW_QUEUE_QUERY_KEY, 'open-count'],
    queryFn: ({ signal }) =>
      getAdminContentInspections(
        { state: AdminReviewState.OPEN, page: 0, size: 1 },
        signal,
      ).then(response => response.data.totalCount),
  })
  return query.data ?? null
}

export interface QueueDetailView {
  inspectionId: number
  row: QueueRowView
  /** 다섯 단계의 흐름 — 어디까지 돌았고 어디서 걸렸는지 */
  stages: PipelineStageView[]
  /** 위반을 든 관점만 모은 것. 화면이 가장 먼저 보여 줘야 하는 값이다 */
  violationRows: PipelinePerspectiveRow[]
  appealReason: string | null
  adminDecidedBy: number | null
  adminDecidedAt: string | null
  adminNote: string | null
  totalCostMicroUsd: number
}

export interface QueueDetailResult {
  detail: QueueDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

function toDetailView(data: AdminInspectionDetailData): QueueDetailView {
  return {
    inspectionId: data.summary.inspectionId,
    row: toQueueRow(data.summary),
    stages: toPipelineStages(data),
    violationRows: collectViolations(data),
    appealReason: data.appealReason ?? null,
    adminDecidedBy: data.adminDecidedBy ?? null,
    adminDecidedAt: data.adminDecidedAt ?? null,
    adminNote: data.adminNote ?? null,
    totalCostMicroUsd: data.totalCostMicroUsd,
  }
}

export function useAiReviewQueueDetail(inspectionId: number | null): QueueDetailResult {
  const query = useQuery({
    queryKey: [...AI_REVIEW_QUEUE_QUERY_KEY, 'detail', inspectionId],
    queryFn:
      inspectionId == null
        ? skipToken
        : ({ signal }) =>
            getAdminContentInspectionDetail(inspectionId, signal).then(response => response.data),
  })
  return {
    detail: query.data ? toDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface DecisionInput {
  inspectionId: number
  decision: InspectionDecision
  /** 허용은 메모(선택), 차단은 사유(필수)를 같은 칸으로 받는다. */
  note: string
}

/**
 * 허용·차단. 둘 다 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
 *
 * 실패해도 무효화하는 이유가 둘이다. 409/40501(이미 처리됨)은 화면이 낡았다는 신호고,
 * 409/40508(내용이 바뀜)은 서버가 결정을 **아예 저장하지 않은** 경우라 상품 상태가 지금
 * 어떤지 다시 받아야 운영자가 다음 행동을 고를 수 있다.
 */
export function useDecideInspection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ inspectionId, decision, note }: DecisionInput) => {
      const trimmed = note.trim()
      return decision === 'allow'
        ? approveAdminContentInspection(inspectionId, trimmed === '' ? {} : { note: trimmed })
        : rejectAdminContentInspection(inspectionId, { reason: trimmed })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_REVIEW_QUEUE_QUERY_KEY }),
  })
}

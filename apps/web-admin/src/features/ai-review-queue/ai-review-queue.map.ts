import type {
  AdminProductInspectionDetail,
  AdminProductInspectionSummary,
  InspectionJudgment,
  ReviewQueueStatus,
} from '@aechak/api'
import type { StatusPillVariant } from '@aechak/design-system/web'

// 어드민 상품 검토 큐 API(admin 모듈) 응답을 화면 모델로 옮기는 매퍼. 서버 enum은 이 파일과 queries에만
// 가두고 화면은 여기서 나온 뷰 타입과 라벨만 읽는다.

export type QueueStatus = ReviewQueueStatus
export type Judgment = InspectionJudgment

export const QUEUE_STATUS_META: Record<QueueStatus, { label: string; variant: StatusPillVariant }> = {
  PENDING_REVIEW: { label: '검토 대기', variant: 'neutral' },
  APPROVED: { label: '관리자 승인', variant: 'success' },
  REJECTED: { label: '관리자 반려', variant: 'error' },
  SUPERSEDED: { label: '셀러 수정으로 종료', variant: 'muted' },
}

/** null은 셀러가 고친 내용을 AI가 아직 보는 중이라는 뜻이다. */
export const JUDGMENT_META: Record<Judgment | 'IN_PROGRESS', { label: string; variant: StatusPillVariant }> = {
  FLAG: { label: '문제 발견', variant: 'warning' },
  UNJUDGED: { label: '판정 없음', variant: 'muted' },
  FAILED: { label: '판정 실패', variant: 'muted' },
  PASS: { label: '통과', variant: 'success' },
  IN_PROGRESS: { label: 'AI 검수 중', variant: 'info' },
}

export const QUEUE_STATUS_FILTER_VALUES: QueueStatus[] = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED']

export const REJECT_REASON_MAX_LENGTH = 500

/** 이의제기 필터 라벨. 체크박스 라벨과 테이블 pill이 같은 말을 써야 운영자가 같은 것으로 읽는다. */
export const APPEAL_FILTER_LABEL = '이의제기된 것만 보기'
export const APPEAL_PILL_META = { label: '이의 제기', variant: 'warning' } as const

export interface AiReviewRowView {
  productId: string
  productName: string
  sellerName: string
  status: QueueStatus
  judgment: Judgment | 'IN_PROGRESS'
  blindedAt: string
  /** 셀러가 이의를 제기한 시각. null이면 제기가 없다 — 전체 목록에서 이의 행을 가리는 유일한 신호다. */
  appealedAt: string | null
}

export interface AiReviewDetailView {
  productId: string
  productName: string
  sellerName: string
  categoryPath: string
  description: string | null
  representativeImageUrl: string | null
  optionNames: string[]
  awaitingAdminReview: boolean
  judgment: Judgment | 'IN_PROGRESS' | null
  reasonSummary: string | null
  sellerNotice: string | null
  settledAt: string
  rejections: { label: string; date: string }[]
  /** 셀러 이의. 제기가 없으면 null이고 화면은 그 자리를 그리지 않는다. */
  appeal: { at: string; reason: string | null } | null
}

export function formatWireDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

export function toAiReviewRow(summary: AdminProductInspectionSummary): AiReviewRowView {
  return {
    productId: summary.productId,
    productName: summary.productName,
    sellerName: summary.sellerName,
    status: summary.status,
    judgment: summary.latestJudgment ?? 'IN_PROGRESS',
    blindedAt: formatWireDateTime(summary.blindedAt),
    appealedAt: summary.appealedAt ?? null,
  }
}

export function toAiReviewDetail(detail: AdminProductInspectionDetail): AiReviewDetailView {
  // 검수를 한 번도 타지 않은 상품은 processingState부터 전부 null이다. 판정이 아직 없으면 AI가 보는 중이다.
  const judgment = detail.processingState == null ? null : (detail.judgment ?? 'IN_PROGRESS')
  return {
    productId: detail.productId,
    productName: detail.productName,
    sellerName: detail.sellerName,
    categoryPath: detail.categoryNames.join(' / '),
    description: detail.description,
    representativeImageUrl: detail.representativeImageUrl,
    optionNames: detail.optionNames,
    awaitingAdminReview: detail.awaitingAdminReview,
    judgment,
    reasonSummary: detail.reasonSummary,
    sellerNotice: detail.sellerNotice,
    settledAt: formatWireDateTime(detail.settledAt),
    rejections: detail.rejections.map(rejection => ({
      label: rejection.reason,
      date: formatWireDateTime(rejection.rejectedAt),
    })),
    // 사유는 셀러가 비워서 보낼 수도 있는 값이라(계약상 nullable) 있을 때만 그린다.
    appeal: detail.appealedAt ? { at: formatWireDateTime(detail.appealedAt), reason: detail.appealReason ?? null } : null,
  }
}

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

/**
 * 409(40500)는 셀러가 고친 내용이 먼저 AI를 통과해 행이 닫혔거나 다른 운영자가 먼저 처리한 경우라
 * 재조회가 답이다. 상품이 사라진 404도 화면이 낡았다는 뜻이라 같은 경로를 탄다.
 */
export function isStaleDecision(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  if (status === 409) return true
  return status === 404 && errorCode === 40000
}

export function decisionErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isStaleDecision(error)) {
    return status === 404
      ? '상품을 찾을 수 없어요. 목록을 다시 불러왔어요.'
      : '이미 처리된 상품이에요. 셀러가 먼저 고쳤거나 다른 운영자가 처리했을 수 있어 목록을 다시 불러왔어요.'
  }
  if (status === 400) return `반려 사유를 ${REJECT_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function loadErrorMessage(error: unknown): string {
  if (toWireError(error).status === 403) return '어드민 권한이 없어 검토 큐를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  return 'AI 검토 큐를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

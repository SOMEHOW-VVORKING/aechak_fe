import type {
  AdminReviewBlindActor,
  AdminReviewBlindReason,
  AdminReviewDetailData,
  AdminReviewReportReason,
  AdminReviewSummary,
  ReviewStatus,
} from '@aechak/api'
import type { HistoryEntry } from '@aechak/domain'

// 와이어 enum·필드는 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 view 타입 어휘만 쓴다.

/**
 * 화면 어휘의 노출 상태. 서버 ReviewStatus 5값과 1:1이다.
 *
 * 예시 데이터 시절의 `reported`는 상태가 아니었다 — 신고 누적은 **상태와 직교하는 축**이고
 * (노출 중이면서 신고가 쌓인 리뷰가 운영자의 작업 목록이다) 서버도 `reportCount`와 `reported`
 * 필터로 따로 준다. 그래서 상태에서 떼어 내고 신고 수는 그대로 신고 수로 보여 준다.
 */
export type ReviewStatusValue = 'public' | 'masked' | 'blinded' | 'hidden' | 'deleted'

const STATUS_FROM_WIRE: Record<ReviewStatus, ReviewStatusValue> = {
  PUBLIC: 'public',
  MASKED: 'masked',
  BLOCKED: 'blinded',
  HIDDEN: 'hidden',
  DELETED: 'deleted',
}

const STATUS_TO_WIRE: Record<ReviewStatusValue, ReviewStatus> = {
  public: 'PUBLIC',
  masked: 'MASKED',
  blinded: 'BLOCKED',
  hidden: 'HIDDEN',
  deleted: 'DELETED',
}

export const reviewStatusToWire = (value: ReviewStatusValue): ReviewStatus => STATUS_TO_WIRE[value]

export const REVIEW_STATUS_LABELS: Record<ReviewStatusValue, string> = {
  public: '노출',
  masked: '마스킹',
  blinded: '블라인드',
  hidden: '숨김',
  deleted: '삭제',
}

/**
 * 운영자가 고를 수 있는 처리 사유. 서버 enum 7값 중 **PROFANITY는 빼 둔다** — 금칙어 판정은
 * 작성 시점 자동 처리가 쓰는 값이라(be ReviewBlindReason) 운영자가 수동으로 고를 자리가 아니다.
 * 라벨은 서버가 주지 않아 FE가 소유한다.
 */
export const BLIND_REASON_LABELS: Record<AdminReviewBlindReason, string> = {
  PROFANITY: '금칙어 자동 판정',
  ABUSE: '욕설/비방',
  EXTERNAL_TRADE: '외부 거래 유도',
  AD_SPAM: '광고/스팸',
  PRIVACY: '개인정보 노출',
  IRRELEVANT: '상품과 무관',
  OTHER: '기타',
}

export const SELECTABLE_BLIND_REASONS = [
  'ABUSE',
  'EXTERNAL_TRADE',
  'AD_SPAM',
  'PRIVACY',
  'IRRELEVANT',
  'OTHER',
] as const satisfies readonly AdminReviewBlindReason[]

export type SelectableBlindReason = (typeof SELECTABLE_BLIND_REASONS)[number]

export function isSelectableBlindReason(value: string): value is SelectableBlindReason {
  return (SELECTABLE_BLIND_REASONS as readonly string[]).includes(value)
}

const REPORT_REASON_LABELS: Record<AdminReviewReportReason, string> = {
  FRAUD: '허위/사기',
  ABUSE: '욕설/비방',
  SPAM: '스팸',
  INAPPROPRIATE: '부적절한 내용',
  OTHER: '기타',
}

export interface AdminReviewRow {
  reviewId: number
  productPublicId: string
  productName: string
  sellerName: string
  authorNickname: string
  authorWithdrawn: boolean
  rating: number
  /** 작성자가 쓴 원문. 운영자가 판단해야 하는 대상이다. */
  content: string
  /** 구매자에게 실제로 보이는 문장. 마스킹된 리뷰면 대체 문구다. */
  visibleContent: string
  photoCount: number
  reportCount: number
  status: ReviewStatusValue
  blindActor: 'ai' | 'admin' | null
  blindReasonLabel: string | null
  blindReasonText: string | null
  createdAt: string
}

export interface AdminReviewDetailView extends AdminReviewRow {
  optionName: string
  imageUrls: string[]
  /** 신고 이력. 신고 접수 경로가 열리기 전까지는 빈 목록이다. */
  reports: HistoryEntry[]
  /** 블라인드·삭제 처리 이력 — 서버가 시각 칼럼으로만 주므로 그 칼럼에서 조립한다. */
  actions: HistoryEntry[]
}

const ACTOR_FROM_WIRE: Record<AdminReviewBlindActor, 'ai' | 'admin'> = { AI: 'ai', ADMIN: 'admin' }

/** 오프셋 없는 LocalDateTime의 날짜 부분. 이력 줄은 날짜 단위로 읽는다. */
export const toDateLabel = (isoLocal: string): string => isoLocal.slice(0, 10)

/** 목록의 작성 시각 — `MM-DD HH:mm`. */
export const toDateTimeLabel = (isoLocal: string): string =>
  `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`

function toRowBase(
  wire: AdminReviewSummary | AdminReviewDetailData,
  photoCount: number,
  reportCount: number,
): AdminReviewRow {
  return {
    reviewId: wire.reviewId,
    productPublicId: wire.productPublicId,
    productName: wire.productName,
    sellerName: wire.sellerName,
    authorNickname: wire.authorNickname,
    authorWithdrawn: wire.authorWithdrawn,
    rating: wire.rating,
    content: wire.content,
    visibleContent: wire.visibleContent,
    photoCount,
    reportCount,
    status: STATUS_FROM_WIRE[wire.reviewStatus],
    blindActor: wire.blindActor ? ACTOR_FROM_WIRE[wire.blindActor] : null,
    blindReasonLabel: wire.blindReasonCode ? BLIND_REASON_LABELS[wire.blindReasonCode] : null,
    blindReasonText: wire.blindReasonText,
    createdAt: wire.createdAt,
  }
}

export function toReviewRow(wire: AdminReviewSummary): AdminReviewRow {
  return toRowBase(wire, wire.photoCount, wire.reportCount)
}

export function toReviewDetailView(wire: AdminReviewDetailData): AdminReviewDetailView {
  return {
    // 상세에는 사진·신고 **수**가 없다 — 배열 길이가 그 수다(목록의 집계와 같은 값).
    ...toRowBase(wire, wire.images.length, wire.reports.length),
    optionName: wire.optionName,
    imageUrls: [...wire.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(image => image.imageUrl),
    reports: wire.reports.map(report => ({
      label: [REPORT_REASON_LABELS[report.reasonCode], report.reasonText?.trim() || null]
        .filter(Boolean)
        .join(' / '),
      date: toDateLabel(report.reportedAt),
    })),
    actions: buildActionHistory(wire),
  }
}

/**
 * 처리 이력. 전용 테이블이 없어 리뷰가 들고 있는 시각 칼럼에서 조립한다 — 삭제는 `blindedAt`을
 * 비우고 `deletedAt`만 남기므로(be Review.deleteByAdmin) 두 칼럼을 함께 봐야 "블라인드했다가
 * 삭제했다"와 "바로 삭제했다"가 갈린다.
 */
function buildActionHistory(wire: AdminReviewDetailData): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  if (wire.blindedAt) {
    const actor = wire.blindActor === 'AI' ? 'AI 자동' : '관리자'
    entries.push({ label: `${actor} 블라인드`, date: toDateLabel(wire.blindedAt) })
  }
  if (wire.deletedAt) {
    // 운영자 삭제만 deletedByAdminId가 채워진다 — 비면 작성자 본인 삭제다.
    const actor = wire.deletedByAdminId == null ? '작성자' : '관리자'
    entries.push({ label: `${actor} 삭제`, date: toDateLabel(wire.deletedAt) })
  }
  return entries
}

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

const FORBIDDEN_BY_ROLE = 20011

function isForbiddenByRole(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  return status === 403 && errorCode === FORBIDDEN_BY_ROLE
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 리뷰 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 90002)
    return '목록 조건이 바뀌었어요. 필터를 다시 선택해 처음부터 불러와 주세요.'
  if (status === 400) return '목록 조건을 서버가 받지 못했어요. 별점과 검색어를 확인해 주세요.'
  return '리뷰 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 리뷰 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '리뷰를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '리뷰 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 블라인드·해제·삭제 실패 문구. 409 둘은 운영자가 할 일이 서로 달라 한 문구로 묶지 않는다 —
 * 이미 가려진 리뷰는 다시 가릴 것이 없고, 가려지지 않은 리뷰는 풀 것이 없다.
 */
export function writeErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 409 && errorCode === 110020)
    return '이미 블라인드된 리뷰예요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 110021)
    return '블라인드되지 않은 리뷰라 해제할 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 400 && errorCode === 110002)
    return '이미 삭제된 리뷰라 상태를 바꿀 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 400 && errorCode === 110022) return '처리 사유 메모는 500자를 넘을 수 없어요.'
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '리뷰를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 처리 사유를 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

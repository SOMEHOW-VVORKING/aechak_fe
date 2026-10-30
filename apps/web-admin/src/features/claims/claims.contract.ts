// 어드민 클레임 BE(origin/develop `boot/admin/.../claim/AdminClaimController`)와 화면 사이의
// 순수 타입·매핑·규칙. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일이 FE 쪽 이름과
// 문구만 붙인다 — OpenAPI 스펙이 바뀌면 재생성만으로 여기서 타입 오류가 드러난다. 서버 enum은
// 이 feature 밖으로 새지 않게 여기 가둔다(web-seller `claims.contract` 관례).
//
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-10-24T10:00:00)이다.
import type { StatusPillVariant } from '@aechak/design-system/web'
import type {
  AdminClaimFaultDecision,
  ClaimStatus,
  ClaimType,
  GetAdminClaimsParams,
  OrderItemStatus,
  OrderStatus,
  RefundStatus,
  ReturnCostBearer,
  SellerApprovalStatus,
  SellerClaimHistoryEvent,
} from '@aechak/api'

export type {
  /** 목록 한 행 + 상세의 claim. 네 상태 축을 접지 않은 원형이다. */
  AdminClaimSummary,
  AdminClaimDetailData,
  AdminClaimOrder,
  AdminClaimBuyerStatement,
  AdminClaimSellerHandling,
  AdminClaimItem,
  AdminClaimHistoryEntry,
  AdminClaimIntervention,
  AdminClaimListData,
  AdminClaimFaultDecisionReasons,
  AdminClaimInterventionReasonOption,
  AdminClaimFaultDecision,
  AdminClaimInterventionReason,
  AdminClaimSort,
  ClaimStatus,
  ClaimType,
  OrderItemStatus,
  OrderStatus,
  RefundStatus,
  ReturnCostBearer,
  SellerApprovalStatus,
  SellerClaimHistoryEvent,
} from '@aechak/api'

// ─── 목록 파라미터 ───────────────────────────────────────────────────────────

export type AdminClaimSearchParams = GetAdminClaimsParams

/** 서버 기본값과 같은 페이지 크기. 서버가 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

/**
 * 화면 필터 상태 그대로의 목록 파라미터 — '전체'를 빈 문자열로, 미선택을 빈 배열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeClaimSearchParams`가 한 곳에서 책임진다.
 */
export type AdminClaimSearchInput = {
  [K in keyof AdminClaimSearchParams]?: NonNullable<AdminClaimSearchParams[K]> | ''
}

/**
 * 빈 값 파라미터를 키째 빼고 문자열을 trim한다(AGENTS 6-6).
 *
 * `openOnly`는 **false도 보낸다** — 서버는 이 축을 주지 않으면 `status`가 빈 요청에서만 개입 가능한
 * 건으로 좁히므로(AdminClaimSearchQuery.effectiveOpenOnly), false를 빼 버리면 "종결까지 전부"를
 * 고른 운영자에게 작업 목록만 돌아온다. 불리언은 빈 값이 아니므로 아래 루프가 그대로 통과시킨다.
 */
export function normalizeClaimSearchParams(input: AdminClaimSearchInput): AdminClaimSearchParams {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      normalized[key] = value
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') continue
      normalized[key] = trimmed
      continue
    }
    normalized[key] = value
  }
  return normalized as AdminClaimSearchParams
}

// ─── 어휘 라벨 ───────────────────────────────────────────────────────────────

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  CANCEL: '취소',
  RETURN: '반품',
  EXCHANGE: '교환',
}

// AGENTS 4절: `danger`는 되돌리기 어려운 제재 전용이라 클레임 유형에는 쓰지 않는다.
export const CLAIM_TYPE_VARIANT: Record<ClaimType, StatusPillVariant> = {
  CANCEL: 'neutral',
  RETURN: 'info',
  EXCHANGE: 'info',
}

/** 상태 축 원값 라벨 — 필터 Select가 쓴다(표시 상태는 `claimDisplayStatus`가 접는다). */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  CLAIM_REQUESTED: '요청됨',
  COLLECTING: '회수 중',
  APPROVED: '승인됨',
  REJECTED: '거부됨',
  ADMIN_OVERRIDDEN: '운영자 개입',
  REFUND_FAILED: '환불 실패',
  WITHDRAWN: '구매자 철회',
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  NONE: '환불 대기',
  REQUESTED: '환불 진행 중',
  DONE: '환불 완료',
  REFUND_FAILED: '환불 실패',
}

export const SELLER_APPROVAL_LABEL: Record<SellerApprovalStatus, string> = {
  REQUESTED: '셀러 판단 대기',
  APPROVED: '셀러 승인',
  REJECTED: '셀러 거부',
}

export const RETURN_COST_BEARER_LABEL: Record<ReturnCostBearer, string> = {
  BUYER: '구매자 부담',
  SELLER: '셀러 부담',
}

/** 귀책 판정 라벨 — 선택지 문구는 카탈로그가 주지 않고(사유만 준다) FE가 소유한다. */
export const FAULT_DECISION_LABEL: Record<AdminClaimFaultDecision, string> = {
  SELLER_FAULT: '셀러 귀책',
  BUYER_FAULT: '구매자 귀책',
  CLAIM_DISMISSED: '클레임 불가',
}

export const CLAIM_HISTORY_EVENT_LABEL: Record<SellerClaimHistoryEvent, string> = {
  REQUESTED: '구매자 요청',
  COLLECTION_STARTED: '회수 송장 등록',
  APPROVED: '셀러 승인',
  CLAWBACK_DEPOSITED: '정산 차감 반영',
  REJECTED: '셀러 거부',
  WITHDRAWN: '구매자 철회',
  ADMIN_OVERRIDDEN: '운영자 개입',
  REFUNDED: '환불 완료',
  RESOLVED: '종결',
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '결제 대기',
  PAID: '결제 완료',
  PREPARING: '상품 준비',
  DISPATCH_PENDING: '발송 대기',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  PURCHASE_CONFIRMED: '구매확정',
  CANCELLED: '취소',
}

export const ORDER_ITEM_STATUS_LABEL: Record<OrderItemStatus, string> = {
  ORDERED: '주문',
  CANCELLED: '취소',
  RETURN_REQUESTED: '반품 요청',
  RETURNED: '반품 완료',
  EXCHANGE_REQUESTED: '교환 요청',
}

export const INTERVENTION_REASON_DETAIL_MAX = 500
export const INTERVENTION_MEMO_MAX = 300

// ─── 표시 ────────────────────────────────────────────────────────────────────

/** `MM-DD HH:mm`. 목록·이력은 연도를 읽지 않는다. */
export const formatClaimDateTime = (isoLocal: string): string =>
  `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`

export const toDateLabel = (isoLocal: string): string => isoLocal.slice(0, 10)

export const won = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`

export interface ClaimDisplayStatus {
  label: string
  variant: StatusPillVariant
  /** pill 아래 보조 문구(없으면 생략). */
  note?: string
}

/**
 * 네 축(status·refundStatus·sellerApprovalStatus·settlementStatus)을 화면의 한 줄로 접는다.
 * 서버가 접지 않고 내리는 이유가 "접는 판정은 화면 몫"이라서, 그 판정이 이 함수 하나에만 있어야 한다.
 *
 * 운영자 화면은 셀러 화면과 접는 기준이 다르다 — 셀러는 "내가 할 일"을, 운영자는 **분쟁이 어디서
 * 멈춰 있는지**를 봐야 한다. 그래서 요청됨은 셀러 판단 대기로 읽고, 환불 실패는 개입이 아니라
 * 재집행이 필요한 자리임을 보조 문구로 적는다.
 */
export function claimDisplayStatus(claim: {
  claimType: ClaimType
  status: ClaimStatus
  refundStatus: RefundStatus | null
  sellerApprovalStatus: SellerApprovalStatus | null
  resolvedAt: string | null
  autoApproveDueAt: string | null
  faultDecision: AdminClaimFaultDecision | null
}): ClaimDisplayStatus {
  switch (claim.status) {
    case 'CLAIM_REQUESTED':
      return {
        label: '셀러 판단 대기',
        variant: 'warning',
        ...(claim.autoApproveDueAt
          ? { note: `${formatClaimDateTime(claim.autoApproveDueAt)} 자동 승인` }
          : {}),
      }
    case 'COLLECTING':
      return { label: '회수 중', variant: 'info' }
    case 'APPROVED':
      if (claim.claimType === 'EXCHANGE') {
        return claim.resolvedAt != null
          ? { label: '교환 완료', variant: 'success' }
          : { label: '재발송 대기', variant: 'warning' }
      }
      if (claim.refundStatus === 'DONE') return { label: '환불 완료', variant: 'success' }
      if (claim.refundStatus === 'REQUESTED') return { label: '환불 진행 중', variant: 'info' }
      return { label: '승인 완료', variant: 'success', note: '환불 대기' }
    case 'REFUND_FAILED':
      // 개입으로 종결할 수 없는 자리다(환불이 움직인 건은 개입 불가) — 재집행 경로가 운영 절차다.
      return { label: '환불 실패', variant: 'error', note: '환불 재집행 필요' }
    case 'REJECTED':
      return { label: '셀러 거부', variant: 'error', note: '운영 개입 대상' }
    case 'WITHDRAWN':
      return { label: '구매자 철회', variant: 'muted' }
    case 'ADMIN_OVERRIDDEN':
      // 제재가 아니라 플랫폼 개입이라 danger가 아니다(AGENTS 4절).
      return {
        label: '운영자 개입',
        variant: 'accent',
        ...(claim.faultDecision ? { note: FAULT_DECISION_LABEL[claim.faultDecision] } : {}),
      }
  }
}

/** 구매자가 고른 사유 문구. 서버가 `reasonLabel`을 함께 내리므로 FE가 코드별 표를 들지 않는다. */
export function claimReasonText(claim: {
  reasonCode: string | null
  reasonLabel: string | null
}): string {
  return claim.reasonLabel ?? claim.reasonCode ?? '미기재'
}

/** 상품명 요약 — 한 클레임이 여러 품목을 들 수 있다. */
export function productSummary(productNames: string[]): string {
  const [first, ...rest] = productNames
  if (!first) return '-'
  return rest.length === 0 ? first : `${first} 외 ${rest.length}건`
}

// ─── 개입 규칙 ───────────────────────────────────────────────────────────────

/**
 * 반품비 부담 주체를 **고를 수 있는지**. 서버는 취소 유형이거나 클레임 불가 판정이면 명시값도
 * 비우므로(be Claim.overrideByAdmin), 그 조합에서 선택을 받으면 고른 값이 조용히 버려지는
 * 동작 안 하는 입력이 된다(AGENTS 2절) — 그래서 그 자리에서는 입력을 아예 그리지 않는다.
 */
export function canChooseCostBearer(claimType: ClaimType, claimAccepted: boolean): boolean {
  return claimType !== 'CANCEL' && claimAccepted
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
    return '어드민 권한이 없어 클레임 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 90002)
    return '목록 조건이 바뀌었어요. 필터를 다시 선택해 처음부터 불러와 주세요.'
  if (status === 400) return '목록 조건을 서버가 받지 못했어요. 기간과 검색어를 확인해 주세요.'
  return '클레임 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 클레임 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '클레임을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '클레임 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/** 개입 사유 카탈로그 실패 — 선택지가 없으면 제출 자체를 할 수 없으므로 그 사실을 적는다. */
export function reasonCatalogErrorMessage(error: unknown): string {
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 개입 사유를 불러올 수 없어요. 관리자 권한을 확인해 주세요.'
  return '개입 사유 선택지를 불러오지 못해 지금은 판정을 제출할 수 없어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 개입 실패 문구. 409 둘은 운영자가 할 일이 서로 달라 한 문구로 묶지 않는다 —
 * 50414는 이 건에 개입할 수 없다는 뜻이고(두 번째 개입도 여기로 온다),
 * 50403은 뒤집으면 한 품목을 두 클레임이 붙잡게 된다는 뜻이다.
 */
export function interveneErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 409 && errorCode === 50414)
    return '지금 개입할 수 없는 클레임이에요. 이미 개입했거나 환불이 움직인 건이에요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 50403)
    return '같은 주문 품목에 다른 클레임이 진행 중이라 되돌릴 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 400 && errorCode === 50415)
    return '그 귀책 판정에서는 고를 수 없는 사유예요. 사유를 다시 선택해 주세요.'
  if (status === 400 && errorCode === 50416) return '기타 사유를 고르면 상세 내용을 적어야 해요.'
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '클레임을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 사유와 메모를 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

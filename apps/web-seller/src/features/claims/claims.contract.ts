// 셀러 클레임 BE(origin/develop `boot/seller/.../order/SellerClaimController`)와 화면 사이의
// 순수 타입·매핑·규칙. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만
// 붙인다 — OpenAPI 스펙이 바뀌면 재생성만으로 여기서 타입 오류가 드러난다. 서버 enum은 이 feature
// 밖으로 새지 않게 여기 가둔다(products.contract·store-settings.contract 관례).
//
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-10-24T10:00:00)이다. 목록 필터는 날짜
// 단위(yyyy-MM-dd)이고 종료일은 당일을 통째로 포함한다(서버가 다음 날 0시 반개구간으로 바꾼다).
import type { StatusPillVariant } from '@aechak/design-system/web'
import type {
  ClaimSettlementStatus,
  ClaimStatus,
  ClaimType,
  GetSellerClaimsParams,
  OrderItemStatus,
  OrderStatus,
  RefundStatus,
  SellerClaimHistoryEvent,
  SellerClaimPendingStage,
} from '@aechak/api'

export type {
  /** 목록 한 행 + 상세의 claim. 네 상태 축을 접지 않은 원형이다. */
  SellerClaimSummary,
  /** 상세 — claim/order/items/history. */
  SellerClaimDetailData,
  SellerClaimOrderInfo,
  SellerClaimItem,
  SellerClaimHistoryEntry,
  SellerClaimTypeCounts,
  SellerClaimListData,
  ClaimStatus,
  ClaimSettlementStatus,
  ClaimType,
  OrderItemStatus,
  OrderStatus,
  RefundStatus,
  ReturnCostBearer,
  SellerClaimPendingStage,
  SellerClaimHistoryEvent,
} from '@aechak/api'

// ─── 목록 파라미터 ───────────────────────────────────────────────────────────
// GET /sellers/me/claims. 정렬 파라미터가 없고(claims.id 내림차순 고정) **키워드 검색도 없다** —
// 주문번호로 찾는 입력을 화면에 두면 동작하지 않는 장식이 된다.

export type SellerClaimSearchParams = GetSellerClaimsParams

/**
 * 화면 필터 상태 그대로의 목록 파라미터 — '전체'를 빈 문자열로, 미선택을 빈 배열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeClaimSearchParams`가 한 곳에서 책임진다.
 */
export type SellerClaimSearchInput = {
  [K in keyof SellerClaimSearchParams]?: NonNullable<SellerClaimSearchParams[K]> | ''
}

/**
 * 빈 값 파라미터를 키째 빼고 문자열을 trim한다.
 *
 * 서버는 값이 빈 파라미터를 "미입력"으로 보지 않는다 — `?requestedFrom=`은 LocalDate.parse가
 * 터져 400 errorCode 90001이 되고, `?status=`·`?claimType=`·`?pendingStage=`·`?refundStatus=`는
 * 원소가 빈 문자열인 1건 배열로 바인딩돼 parseEnum에서 같은 400이 된다. 화면 필터는 '전체'를 빈
 * 문자열로 들고 있으므로 그대로 넘기면 전 목록 조회가 400으로 깨진다.
 *
 * 배열은 비면 키째 뺀다 — 값이 있는 배열은 공유 클라이언트의 `paramsSerializer`가 반복
 * 파라미터(`?status=A&status=B`)로 직렬화한다. 숫자 0(`page=0`)은 값이 있는 것이므로 남긴다.
 */
export function normalizeClaimSearchParams(input: SellerClaimSearchInput): SellerClaimSearchParams {
  const normalized: Record<string, unknown> = {}
  // 값 타입이 필드마다 다르므로 unknown으로 받아 모양으로 가른다(enum 배열 원소와 '' 비교가 안 된다).
  for (const [key, value] of Object.entries(input) as [string, unknown][]) {
    if (value == null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') normalized[key] = trimmed
      continue
    }
    if (Array.isArray(value)) {
      const kept = value.filter(item => item != null && item !== '')
      if (kept.length > 0) normalized[key] = kept
      continue
    }
    normalized[key] = value
  }
  return normalized as SellerClaimSearchParams
}

// ─── 어휘 라벨 ───────────────────────────────────────────────────────────────

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  CANCEL: '취소',
  RETURN: '반품',
  EXCHANGE: '교환',
}

// AGENTS 4절: `danger`는 되돌리기 어려운 제재 전용이라 클레임 유형에는 쓰지 않는다. 취소는 배송
// 전이라 중립, 물건이 오가는 반품·교환만 info로 눈에 띄게 둔다.
export const CLAIM_TYPE_VARIANT: Record<ClaimType, StatusPillVariant> = {
  CANCEL: 'neutral',
  RETURN: 'info',
  EXCHANGE: 'info',
}

/** 승인 버튼 문구 — 유형마다 승인의 뜻이 다르다(취소는 종결, 반품·교환은 회수 시작). */
export const CLAIM_APPROVE_LABEL: Record<ClaimType, string> = {
  CANCEL: '취소 승인',
  RETURN: '반품 승인',
  EXCHANGE: '교환 승인',
}

/** 상태 축 원값 라벨 — 필터 Select가 쓴다(표시 상태는 아래 `claimDisplayStatus`가 접는다). */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  CLAIM_REQUESTED: '요청됨',
  COLLECTING: '회수 중',
  APPROVED: '승인됨',
  REJECTED: '거부됨',
  ADMIN_OVERRIDDEN: '관리자 개입',
  REFUND_FAILED: '환불 실패',
  WITHDRAWN: '구매자 철회',
}

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  NONE: '환불 대기',
  REQUESTED: '환불 진행 중',
  DONE: '환불 완료',
  REFUND_FAILED: '환불 실패',
}

/** 처리 대기 단계(SCRUM-278). 카피 규칙대로 구분자는 `/`다. */
export const PENDING_STAGE_LABEL: Record<SellerClaimPendingStage, string> = {
  DECISION_PENDING: '승인/거부 대기',
  COLLECTION_INVOICE_PENDING: '회수 송장 등록 대기',
  COLLECTION_COMPLETION_PENDING: '회수 완료 처리 대기',
  RESHIP_PENDING: '교환 재발송 대기',
}

// 이력 사건 라벨. CLAWBACK_DEPOSITED는 열 자리만 있고 BE에 쓰는 코드가 없어(clawbackDepositedAt을
// 채우는 경로가 develop에 없다) 지금은 나타나지 않는다 — 라벨만 두고 뜻을 짓지 않는다.
export const CLAIM_HISTORY_EVENT_LABEL: Record<SellerClaimHistoryEvent, string> = {
  REQUESTED: '구매자 요청',
  COLLECTION_STARTED: '회수 송장 등록',
  APPROVED: '승인',
  CLAWBACK_DEPOSITED: '정산 차감 반영',
  REJECTED: '거부',
  WITHDRAWN: '구매자 철회',
  ADMIN_OVERRIDDEN: '관리자 개입',
  REFUNDED: '환불 완료',
  RESOLVED: '종결',
}

export const RETURN_COST_BEARER_LABEL = {
  BUYER: '구매자 부담',
  SELLER: '셀러 부담',
} as const

// SETTLED로 바꾸는 코드가 develop에 없다 — settlementStatus는 Claim.request에서 PENDING으로만
// 써진다. 그래서 지금은 '정산 반영 대기'만 나타난다(라벨만 두고 뜻을 짓지 않는다).
export const CLAIM_SETTLEMENT_STATUS_LABEL: Record<ClaimSettlementStatus, string> = {
  PENDING: '정산 반영 대기',
  SETTLED: '정산 반영 완료',
}

/** 상세의 주문 상태. 결제 대기(PENDING_PAYMENT)는 클레임이 붙을 수 없지만 enum에는 있다. */
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

export const CLAIM_REJECTION_REASON_MAX = 500
export const CLAIM_SELLER_MEMO_MAX = 500

// ─── 표시 상태 접기 ──────────────────────────────────────────────────────────

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
 * 승인됨(APPROVED)에 서로 다른 세 상황이 섞여 있다 — 반품·취소의 환불 대기/진행/완료와, 환불이
 * 없는 교환의 재발송 대기/완료다. 그래서 유형과 환불 축을 함께 본다.
 */
export function claimDisplayStatus(claim: {
  claimType: ClaimType
  status: ClaimStatus
  refundStatus: RefundStatus | null
  resolvedAt: string | null
  autoApproveDueAt: string | null
}): ClaimDisplayStatus {
  switch (claim.status) {
    case 'CLAIM_REQUESTED':
      return {
        label: '승인 대기',
        variant: 'warning',
        // 기한이 지나면 배치가 반품비 부담 주체 없이 승인한다 — 셀러가 먼저 판단할 이유를 보여준다.
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
      // 승인 직후 refundStatus는 NONE이고 환불은 배치가 집행한다 — 셀러가 할 일은 없다.
      return { label: '승인 완료', variant: 'success', note: '환불 대기' }
    case 'REFUND_FAILED':
      return { label: '환불 실패', variant: 'error' }
    case 'REJECTED':
      return { label: '거부', variant: 'error' }
    case 'WITHDRAWN':
      return { label: '구매자 철회', variant: 'muted' }
    case 'ADMIN_OVERRIDDEN':
      // 제재가 아니라 플랫폼 개입이라 danger가 아니다(AGENTS 4절).
      return { label: '관리자 개입', variant: 'accent' }
  }
}

// ─── 사유 표시 ───────────────────────────────────────────────────────────────

/**
 * 구매자가 고른 사유 문구. **코드별 라벨 표를 FE가 들지 않는다** — 사유 어휘가 고정 어휘로
 * 바뀌는 중이고(SCRUM-273 / PR #150) 머지되면 서버가 `reasonLabel`을 함께 내린다. 그 전에는
 * 필드 자체가 없으므로, 있으면 그 문구를 쓰고 없으면 코드를 그대로 보여준다. 둘 다 없는 행
 * (고정 어휘 이관 전 데이터)은 사유를 지어내지 않고 미기재로 표시한다.
 */
export function claimReasonText(claim: { reasonCode: string | null; reasonLabel?: string | null }): string {
  const label = claim.reasonLabel?.trim()
  if (label) return label
  const code = claim.reasonCode?.trim()
  return code ? code : '사유 미기재'
}

/** 구매자가 적은 사유 상세 — 셀러가 반품비 부담 주체를 판단하는 유일한 근거다. */
export function claimReasonDetailText(claim: { reasonDetail: string | null }): string | null {
  const detail = claim.reasonDetail?.trim()
  return detail ? detail : null
}

// ─── 반품비 문구 ─────────────────────────────────────────────────────────────

/**
 * 반품비 부담 문구. 서버는 조립하지 않고 근거 3필드만 내린다
 * (returnCostBearer·returnShippingFee·dispatched).
 * - 취소는 반품비가 없다(returnShippingFee가 null) — 발송 전이면 "미발송"까지 밝힌다.
 * - 승인 전에는 부담 주체가 정해지지 않았다(null) — 승인 때 셀러가 고른다.
 * - 설정값이 0원이면 금액을 숨긴다(정책 스냅샷이 아직 서버 설정값이라 0이 "무료"와 구별되지 않는다).
 *
 * **이 두 값은 아직 어떤 금액도 움직이지 않는다.** develop에서 returnCostBearer는 저장·응답 경로에만
 * 쓰이고(Claim.approveBySeller → SellerClaimSummaryResponse), returnShippingFee는 조회 때 서버
 * 설정값을 실어 보여 주기만 한다(SellerClaimQueryService.returnShippingFeeOf). 환불액은
 * 품목 환불액 합 + 배송비 환불액이다 — 화면 문구가 차감을 약속하면 거짓말이 된다.
 */
export function returnCostText(claim: {
  claimType: ClaimType
  returnCostBearer: 'BUYER' | 'SELLER' | null
  returnShippingFee: number | null
  dispatched: boolean
}): string {
  if (claim.claimType === 'CANCEL') {
    return claim.dispatched ? '반품비 없음' : '반품비 없음 (미발송)'
  }
  const bearer = claim.returnCostBearer ? RETURN_COST_BEARER_LABEL[claim.returnCostBearer] : '부담 주체 미정'
  const fee = claim.returnShippingFee
  return fee != null && fee > 0 ? `${bearer} / ${fee.toLocaleString()}원` : bearer
}

/**
 * 환불 예정액 문구. **교환에는 환불이 없다**(ClaimType.isRefundable이 EXCHANGE를 뺀다 — 환불 집행
 * 스캔 대상이 아니다). 그런데 요청 시점 계산기가 품목 환불액을 유형과 무관하게 채워 두어
 * `refundAmount`에는 교환에도 0이 아닌 값이 실린다 — 그 숫자를 "환불 예정"으로 띄우면 거짓말이다.
 */
export function claimRefundText(claim: { claimType: ClaimType; refundAmount: number }): string {
  if (claim.claimType === 'EXCHANGE') return '환불 없음 (재발송)'
  return `${claim.refundAmount.toLocaleString()}원`
}

// ─── 다음 처리 판정 ──────────────────────────────────────────────────────────

/**
 * 목록 한 행에서 가를 수 있는 다음 처리.
 *
 * `collecting`이 따로 있는 이유: 회수 중(COLLECTING) 한 상태에 **회수 송장 등록 대기**와
 * **회수 완료 처리 대기**가 함께 들어 있고, 그 둘을 가르는 `collectionStartedAt`이 목록 응답에
 * 없다(BE SellerClaimSummaryResponse에 그 필드가 빠져 있다 — 뷰에는 있다). 행만 보고 어느 쪽인지
 * 정하면 거짓말이 되므로 목록에서는 상세로 보내고, 단계는 상세의 이력(COLLECTION_STARTED)으로
 * 가른다(`claimDetailAction`).
 *
 * `reship`은 행만으로 판정할 수 있다 — 교환이 APPROVED에 이르는 유일한 경로가 회수 완료이고
 * (승인은 COLLECTING으로 보낸다, 자동승인도 같다), 교환은 환불 축을 타지 않아 APPROVED로 되돌아
 * 오는 경로도 없다. 즉 교환 + APPROVED면 회수는 이미 끝났다.
 */
export type ClaimRowAction = 'decision' | 'collecting' | 'reship' | 'none'

export function claimRowAction(claim: {
  claimType: ClaimType
  status: ClaimStatus
  sellerApprovalStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null
  resolvedAt: string | null
}): ClaimRowAction {
  // 승인·거부 가능 여부는 상태가 아니라 셀러 판단 축이 가른다(Claim.requireSellerDecisionPending).
  if (claim.status === 'CLAIM_REQUESTED' && claim.sellerApprovalStatus === 'REQUESTED') return 'decision'
  if (claim.status === 'COLLECTING') return 'collecting'
  if (claim.claimType === 'EXCHANGE' && claim.status === 'APPROVED' && claim.resolvedAt == null) {
    return 'reship'
  }
  return 'none'
}

export type ClaimDetailAction = 'decision' | 'collection-invoice' | 'collection-complete' | 'reship' | 'none'

/**
 * 상세에서 가르는 다음 처리. 목록이 못 가르는 회수 단계를 이력으로 판정한다 —
 * `COLLECTION_STARTED`가 이력에 있으면 회수가 시작된 것이고(완료 처리 대기), 없으면 송장 등록 대기다.
 */
export function claimDetailAction(
  claim: Parameters<typeof claimRowAction>[0],
  history: { event: SellerClaimHistoryEvent }[],
): ClaimDetailAction {
  const rowAction = claimRowAction(claim)
  if (rowAction !== 'collecting') return rowAction
  return history.some(entry => entry.event === 'COLLECTION_STARTED')
    ? 'collection-complete'
    : 'collection-invoice'
}

// ─── 날짜 표시 ───────────────────────────────────────────────────────────────

/** `2026-10-24T10:00:00` → `2026-10-24 10:00`. 오프셋이 없는 벽시계라 Date로 파싱하지 않는다. */
export function formatClaimDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

/** 목록 표의 날짜 칸 — 날짜 단위 필터와 눈으로 맞춰 보려면 앞 10자만 쓴다. */
export function formatClaimDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '—'
}

// ─── 에러 문구 ───────────────────────────────────────────────────────────────
// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).
// 인증 계열은 공유 클라이언트가 먼저 전역 처리한다(401 refresh → setOnAuthExpired) — 그래도
// promise가 화면까지 reject되므로 전역 이동 전/실패 시 보일 문구를 채운다.
//
// **클레임은 조회까지 ACTIVE 셀러만 통과한다**(ClaimFacade가 모든 경로를 isActiveSeller로 감싼다) —
// 상품·주문이 휴점 셀러에게 조회를 열어 주는 것과 다르다. 그래서 50404가 목록에서도 날 수 있다.
const ERROR_MESSAGE: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  20005: '이용이 제한된 계정이에요. 고객센터에 문의해 주세요.',
  20006: '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.',
  50000: '주문을 찾을 수 없어요. 목록을 새로고침해 주세요.',
  50302: '이미 송장이 등록된 건이에요. 목록을 새로고침해 주세요.',
  50303: '선택한 택배사를 찾을 수 없어요. 택배사를 다시 선택해 주세요.',
  50304: '송장번호 형식이 맞지 않아요. 번호를 다시 확인해 주세요.',
  50400: '클레임을 찾을 수 없어요. 목록을 새로고침해 주세요.',
  50402: '지금 상태에서는 할 수 없는 처리예요. 목록을 새로고침해 주세요.',
  50404: '판매 활동이 가능한 계정만 클레임을 볼 수 있어요.',
  50405: '거부 사유를 입력해 주세요.',
  50407: '환불 처리가 실패한 건이에요. 잠시 후 다시 확인해 주세요.',
  50408: '이미 처리된 클레임이에요. 목록을 새로고침해 주세요.',
  50409: '회수를 진행할 수 없는 상태예요. 목록을 새로고침해 주세요.',
  50411: '회수가 끝난 교환만 재발송할 수 있어요.',
  90000: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  90001: '입력한 내용을 다시 확인해 주세요.',
  90003: '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해 주세요.',
}

// axios 타입을 안 끌어오려고 duck-typing(products·store-settings 관례). 본문은 `{ errorCode, message }`.
export function claimErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } }).response?.data?.errorCode
  return (code !== undefined && ERROR_MESSAGE[code]) || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

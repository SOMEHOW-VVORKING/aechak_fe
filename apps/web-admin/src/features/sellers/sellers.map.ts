import type {
  AdminSellerDetailData,
  AdminSellerSummary,
  AdminSellerTypeFilter,
  BusinessType,
  SellerSanctionAction,
  SellerSanctionHistory,
  SellerSanctionReasonCode,
  SellerStatus,
} from '@aechak/api'
import type {
  HistoryEntry,
  SellerAccount,
  SellerLegalType,
  SellerOperatingStatus,
} from '@aechak/domain'

// 어드민 셀러 관리 API(admin 모듈) 응답을 화면 모델로 옮기는 매퍼. 서버 enum·와이어 필드는 이
// 파일과 queries에만 가두고(AGENTS 6-2), 라우트는 여기서 나온 뷰 타입만 읽는다.
// 응답에 없는 값(최근 접속·누적 신고)은 만들어 내지 않는다 — users에 접속 칼럼이 없고 신고 대상
// 종류에 셀러가 없어 둘 다 서버가 셀 수 없는 값이다.

// ── 1. 운영 상태 — 서버 대문자 ↔ 화면 소문자 ───────────────────────────────────

const STATUS_FROM_WIRE: Record<SellerStatus, SellerOperatingStatus> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  SUSPENDED: 'suspended',
  WITHDRAWAL_REQUESTED: 'withdrawal-requested',
  WITHDRAWN: 'withdrawn',
}

/**
 * 상태 필터의 와이어 값. 'all'은 파라미터 자체를 보내지 않는다.
 *
 * 서버가 알 수 없는 status를 조건 없음으로 보정하므로 소문자를 그대로 보내도 400은 아니지만,
 * 그러면 **필터가 조용히 전체 조회가 된다** — 운영자는 거른 줄 알고 안 걸러진 목록을 읽는다.
 */
export const STATUS_FILTER_TO_WIRE = {
  active: 'ACTIVE',
  paused: 'PAUSED',
  suspended: 'SUSPENDED',
  'withdrawal-requested': 'WITHDRAWAL_REQUESTED',
  withdrawn: 'WITHDRAWN',
} as const satisfies Record<SellerOperatingStatus, SellerStatus>

export type SellerStatusFilterValue = 'all' | keyof typeof STATUS_FILTER_TO_WIRE

// ── 2. 판매자 유형 — 세 유형(표시)과 두 값 축(필터)이 다르다 ───────────────────

const LEGAL_TYPE_FROM_WIRE: Record<BusinessType, SellerLegalType> = {
  PERSONAL_GENERAL: 'individual',
  SOLE_PROPRIETORSHIP: 'individual-business',
  CORPORATE: 'corporate-business',
}

/**
 * 유형 필터의 와이어 값. 거르는 축은 "사업자인가" 둘뿐이라 세 유형과 1:1이 아니다
 * (BUSINESS = 개인 사업자 + 법인 사업자).
 *
 * **ALL이 아닌 값을 주면 입점 신청서가 없는 셀러(유형 미확인)가 결과에서 빠진다** — 서버가
 * 유형을 모르는 셀러를 어느 쪽으로도 세지 않기 때문이고, 화면이 그 사실을 적어야 한다.
 */
export const TYPE_FILTER_TO_WIRE = {
  business: 'BUSINESS',
  individual: 'INDIVIDUAL',
} as const satisfies Record<string, AdminSellerTypeFilter>

export type SellerTypeFilterValue = 'all' | keyof typeof TYPE_FILTER_TO_WIRE

/** 신청서가 없어 유형을 모르는 셀러의 화면 값 — 개인으로 접으면 거짓이 된다. */
export const LEGAL_TYPE_UNKNOWN = 'unknown'

export type SellerLegalTypeValue = SellerLegalType | typeof LEGAL_TYPE_UNKNOWN

// ── 3. 제재 어휘 — 라벨은 응답에 없어 화면이 소유한다 ──────────────────────────

/** 판매정지 사유 고정 어휘의 화면 라벨. 가운뎃점 대신 `/`를 쓴다(카피 규칙). */
export const SUSPENSION_REASON_LABELS: Record<SellerSanctionReasonCode, string> = {
  FALSE_PRODUCT_INFO: '상품 정보 허위 기재',
  REPEATED_REPORT: '신고 누적',
  ABNORMAL_TRANSACTION: '결제 / 정산 이상 거래',
  OTHER: '기타 (상세 사유 필수)',
}

/** 이력 행의 조치 라벨 — 이력은 추가 전용이라 해제도 한 행으로 쌓인다. */
const ACTION_LABELS: Record<SellerSanctionAction, string> = {
  SUSPEND: '판매정지',
  RELEASE: '정지 해제',
}

/**
 * 운영 합의한 정지 기간. 서버는 1~365일을 받지만 임의 숫자 입력을 두지 않는다.
 *
 * 무기한은 `durationDays`를 보내지 않는 것인데, 화면 값으로 빈 문자열을 쓰지 않는다 — DS
 * `Select`는 값이 빈 문자열이면 placeholder 색으로 그려서 **고른 선택이 미선택처럼 보인다.**
 * 미선택이 아니라 하나의 선택이므로 별도 센티넬을 두고 라벨을 단다.
 */
export const SUSPENSION_DURATION_INDEFINITE = 'indefinite'

export const SUSPENSION_DURATION_OPTIONS = [
  { value: SUSPENSION_DURATION_INDEFINITE, label: '무기한' },
  { value: '3', label: '3일' },
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
]

/** 서버 저장 한계. 넘기면 400 errorCode 10011이라 화면에서 먼저 막는다. */
export const SELLER_TEXT_MAX_LENGTH = 500

// ── 4. 날짜 ───────────────────────────────────────────────────────────────────

/** 서버는 오프셋 없는 LocalDateTime을 준다 — 목록·이력은 날짜 단위로 읽는다. */
export function toDateLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function toDateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

// ── 5. 응답 → 뷰 ──────────────────────────────────────────────────────────────

export function toSellerAccount(wire: AdminSellerSummary): SellerAccount {
  return {
    id: String(wire.sellerId),
    sellerId: wire.sellerId,
    shopName: wire.storeName,
    representativeNameMasked: wire.representativeNameMasked,
    legalType: wire.businessType ? LEGAL_TYPE_FROM_WIRE[wire.businessType] : null,
    operatingStatus: STATUS_FROM_WIRE[wire.status],
    productCount: wire.productCount,
    cumulativeOrders: wire.cumulativeOrderCount,
    hasUnsettledAmount: wire.hasUnsettledAmount,
    statusChangedAt: wire.statusChangedAt,
    suspensionUntil: wire.suspensionUntil,
  }
}

export interface SellerSanctionEntryView extends HistoryEntry {
  sanctionId: number
  /** 사유 어휘 + 상세를 합친 한 줄. 해제 행은 어휘가 없어 상세만 남는다. */
  reason: string | null
  /** **그때 정한** 해제 예정 시각(날짜). 무기한 정지와 해제 행은 null이다. */
  effectiveUntil: string | null
  /** 그 조치 시점의 메모 사본 — 현재 메모와 다를 수 있다. */
  memo: string | null
  actedByAdminId: number
}

export function toSellerSanctionEntry(wire: SellerSanctionHistory): SellerSanctionEntryView {
  const code = wire.reasonCode ? SUSPENSION_REASON_LABELS[wire.reasonCode] : null
  const detail = wire.reasonDetail?.trim() || null
  return {
    sanctionId: wire.sanctionId,
    label: ACTION_LABELS[wire.action],
    date: toDateTimeLabel(wire.actedAt),
    reason: [code, detail].filter(Boolean).join(' / ') || null,
    effectiveUntil: wire.effectiveUntil ? toDateLabel(wire.effectiveUntil) : null,
    memo: wire.memo,
    actedByAdminId: wire.actedByAdminId,
  }
}

export interface SellerDetailView {
  seller: SellerAccount
  /** 현재 정지의 사유 어휘. 정지 중이 아니면 null이고 사유 선택의 초기값이 된다. */
  suspensionReasonCode: SellerSanctionReasonCode | null
  /** 사람이 읽는 현재 정지 사유 한 줄. 해제하면 null이다. */
  suspensionReason: string | null
  /** 셀러의 **현재** 운영자 메모. 이력 행의 memo와 다를 수 있다. */
  internalMemo: string | null
  sanctions: SellerSanctionEntryView[]
}

export function toSellerDetail(wire: AdminSellerDetailData): SellerDetailView {
  return {
    seller: toSellerAccount(wire.seller),
    suspensionReasonCode: wire.suspensionReasonCode,
    suspensionReason: wire.suspensionReason,
    internalMemo: wire.internalMemo,
    sanctions: wire.sanctions.map(toSellerSanctionEntry),
  }
}

// ── 6. 조치 가능 여부 ─────────────────────────────────────────────────────────

/** 판매정지와 해제 중 지금 서버가 받아 주는 조치. 없으면 둘 다 거절되는 상태다. */
export type SellerAction = 'suspend' | 'release'

/**
 * 탈퇴 신청·탈퇴 완료 셀러는 정지도 해제도 409 errorCode 10009로 거절된다(해제가 되돌릴 자리가
 * 없다) — 누르는 즉시 실패하는 버튼을 세우지 않는다. 휴업(PAUSED)은 정지가 가능하다.
 */
export function allowedAction(status: SellerOperatingStatus): SellerAction | null {
  if (status === 'withdrawn' || status === 'withdrawal-requested') return null
  return status === 'suspended' ? 'release' : 'suspend'
}

// ── 7. 에러 분기 ──────────────────────────────────────────────────────────────
// axios 타입을 끌어오지 않으려고 duck-typing으로 읽는다(다른 어드민 feature와 같은 관례).
// 서버 message는 -습니다 격식체라 그대로 띄우지 않는다(카피 규칙).

interface WireError {
  status?: number
  errorCode?: number
}

export function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

const FORBIDDEN_BY_ROLE = 20011

const isForbidden = (error: unknown): boolean => {
  const { status, errorCode } = toWireError(error)
  return status === 403 && (errorCode === FORBIDDEN_BY_ROLE || errorCode == null)
}

export function listErrorMessage(error: unknown): string {
  if (isForbidden(error))
    return '어드민 권한이 없어 셀러 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  return '셀러 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbidden(error))
    return '어드민 권한이 없어 셀러 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  // 404는 없는 계정과 셀러로 등록되지 않은 계정이 같은 응답이다.
  if (status === 404) return '셀러를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '셀러 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 판매정지·해제 실패 문구. 409 둘은 운영자가 할 일이 달라 한 문구로 묶지 않는다 —
 * 이미 정지/정지 아님은 화면이 낡은 것이고, 탈퇴 셀러는 애초에 되돌릴 자리가 없다.
 */
export function actionErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 409 && errorCode === 10007)
    return '이미 판매정지된 셀러예요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 10008)
    return '판매정지 상태가 아니라 해제할 것이 없어요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 10009)
    return '탈퇴한 셀러이거나 다른 운영자가 먼저 처리했어요. 목록을 다시 불러왔어요.'
  if (status === 400 && errorCode === 10010) return '기타 사유를 고르면 상세 사유를 적어야 해요.'
  if (status === 400 && errorCode === 10011)
    return `사유와 메모는 ${SELLER_TEXT_MAX_LENGTH}자 이하로 입력해 주세요.`
  if (status === 404) return '셀러를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (isForbidden(error)) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 사유와 기간을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/** 메모 저장 실패 문구 — 제재 실패와 섞으면 "이미 정지됨" 같은 엉뚱한 안내가 나간다. */
export function memoErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 400 && errorCode === 10011)
    return `메모는 ${SELLER_TEXT_MAX_LENGTH}자 이하로 입력해 주세요.`
  if (status === 409) return '다른 운영자가 먼저 처리했어요. 목록을 다시 불러왔어요.'
  if (status === 404) return '셀러를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (isForbidden(error)) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  return '메모를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

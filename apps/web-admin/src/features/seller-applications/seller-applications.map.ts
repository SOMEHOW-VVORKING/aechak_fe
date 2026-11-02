import { Contact, FileCheck, FileText, Landmark, ScrollText, Stamp } from 'lucide-react'
import {
  ApplicationStatus,
  BusinessType,
  type AdminApplicationDetail,
  type AdminApplicationSummary,
} from '@aechak/api'
import type { SellerApplicationStatus } from '@aechak/domain'
import { maskPersonName } from '@/shared/mask'

// 어드민 심사 API(admin 모듈) 응답을 화면 모델로 옮기는 매퍼. 서버 enum·와이어 필드는 이 파일과
// queries에만 가두고(AGENTS "서버 enum/필드는 feature 안에 가둔다"), 라우트는 여기서 나온
// 뷰 타입만 읽는다. 목록 응답에 없는 값(사업자등록번호·전화번호)은 만들어 내지 않는다.

export type SellerType = 'business' | 'individual'

/** lucide 아이콘 컴포넌트 타입 — 서류 타일이 그대로 렌더한다. */
export type DocumentIconComponent = typeof FileText

export interface ApplicationRowView {
  /** DataTable rowKey용 문자열 id. 서버 식별자는 applicationId(Long)다. */
  id: string
  applicationId: number
  applicantName: string
  sellerType: SellerType
  status: SellerApplicationStatus
  /** 목록 응답에는 제출일(submittedAt)만 있다 — 신청서 생성 시각(appliedAt)은 상세에만 있어
   *  목록 컬럼 라벨도 '제출일'이다(같은 라벨이 두 값을 가리키지 않게 한다). */
  submittedAt: string | null
}

export interface ApplicationDocumentView {
  documentType: string
  label: string
  icon: DocumentIconComponent
  /** presigned GET이고 유효기간 5분 — 상세를 다시 조회해 받은 값만 열어야 한다. */
  downloadUrl: string
}

export interface ApplicationReviewView {
  label: string
  date: string
  /** 건별 반려 사유. 승인으로 끝난 신청의 과거 반려 사유는 reviews[]가 유일한 보관처라
   *  심사 이력 줄에 그대로 보여 준다(서버 rejectionReason은 REJECTED가 아니면 null이다). */
  rejectionReason: string | null
}

export interface ApplicationDetailView {
  applicationId: number
  status: SellerApplicationStatus
  sellerType: SellerType
  applicantName: string
  /** 평문 대표자명을 화면에서 마스킹한 값. 서버는 마스킹하지 않는다(계약). */
  representativeNameMasked: string | null
  /** 평문 사업자등록번호를 화면에서 마스킹한 값. 없으면 null(개인 일반). */
  businessRegNoMasked: string | null
  appliedAt: string
  submittedAt: string | null
  /** status가 REJECTED일 때만 서버가 채운다. */
  rejectionReason: string | null
  /** 직전 반려 사유 — 승인 뒤에는 rejectionReason이 비므로 심사 이력에서 되찾는다. */
  lastRejectionReason: string | null
  documents: ApplicationDocumentView[]
  reviews: ApplicationReviewView[]
}

// ── 1. 상태 대소문자 ────────────────────────────────────────────────────────────
// 화면 타입(@aechak/domain SellerApplicationStatus)은 소문자, 서버 enum은 대문자다.

const SCREEN_STATUS: Record<ApplicationStatus, SellerApplicationStatus> = {
  [ApplicationStatus.DRAFT]: 'draft',
  [ApplicationStatus.SUBMITTED]: 'submitted',
  [ApplicationStatus.REVIEWING]: 'reviewing',
  [ApplicationStatus.APPROVED]: 'approved',
  [ApplicationStatus.REJECTED]: 'rejected',
  [ApplicationStatus.CANCELLED]: 'cancelled',
}

const WIRE_STATUS: Record<SellerApplicationStatus, ApplicationStatus> = {
  draft: ApplicationStatus.DRAFT,
  submitted: ApplicationStatus.SUBMITTED,
  reviewing: ApplicationStatus.REVIEWING,
  approved: ApplicationStatus.APPROVED,
  rejected: ApplicationStatus.REJECTED,
  cancelled: ApplicationStatus.CANCELLED,
}

export const toScreenStatus = (status: ApplicationStatus): SellerApplicationStatus =>
  SCREEN_STATUS[status]

/** 상태 필터를 서버로 보낼 때 쓴다 — 소문자를 그대로 보내면 400 errorCode 90001이다. */
export const toWireStatus = (status: SellerApplicationStatus): ApplicationStatus =>
  WIRE_STATUS[status]

/**
 * 상태 필터 탭으로 의미가 있는 값. REVIEWING·CANCELLED로 가는 전이 코드가 서버에 없어
 * 그 상태의 신청은 생기지 않으므로 필터에서 뺀다(statusMeta는 표시용으로 6값을 유지한다).
 */
export const STATUS_FILTER_VALUES: SellerApplicationStatus[] = [
  'submitted',
  'approved',
  'rejected',
  'draft',
]

/** 승인·반려가 가능한 상태 — BE SellerApplication.requireDecidable()과 같은 집합이다. */
export const isDecidable = (status: SellerApplicationStatus): boolean =>
  status === 'submitted' || status === 'reviewing'

// ── 2. businessType → 판매자 유형 ──────────────────────────────────────────────

export const toSellerType = (businessType: BusinessType): SellerType =>
  businessType === BusinessType.PERSONAL_GENERAL ? 'individual' : 'business'

// ── 3. 신청인 이름 폴백 ────────────────────────────────────────────────────────
// 상호명이 없으면 대표자명으로 접는다 — BE 승인 로직이 스토어명을 정할 때 쓰는 폴백과 같다.

export function toApplicantName(
  businessName: string | null,
  representativeName: string | null,
): string {
  const business = businessName?.trim()
  if (business) return business
  const representative = representativeName?.trim()
  if (representative) return representative
  return '이름 미기재'
}

// ── 4·7. 날짜·마스킹 ───────────────────────────────────────────────────────────

/** 서버는 오프셋 없는 LocalDateTime 문자열을 준다 — 날짜 부분만 떼어 쓴다. */
export function formatWireDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function formatWireDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

/**
 * 사업자등록번호 마스킹. 서버는 평문(하이픈 유무 불문)을 주고 마스킹은 화면 책임이다.
 * 10자리면 `###-##-*****`, 그 밖이면 앞 3자만 남긴다.
 */
export function maskBusinessRegNo(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (digits === '') return null
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-*****`
  return `${digits.slice(0, 3)}${'*'.repeat(Math.max(0, digits.length - 3))}`
}

/**
 * 대표자 실명 마스킹. 클레임 상세의 수령인명도 같은 책임이라 `@/shared/mask`로 승격했고
 * (feature → feature import 금지) 여기서는 그 이름을 그대로 다시 내보낸다.
 */
export { maskPersonName }

// ── 5. documentType → 아이콘·한국어 라벨 ───────────────────────────────────────
// 라벨은 BE DocumentType의 label과 같은 문구다(응답에는 실리지 않아 화면이 들고 있어야 한다).
// 이전 화면의 아이콘 키(business-reg/mail-order/bankbook/id-card)는 서버 값과 하나도 겹치지
// 않아 6종 전부가 폴백 아이콘으로 떨어져 있었다.

const DOCUMENT_META: Record<string, { label: string; icon: DocumentIconComponent }> = {
  ID_CARD: { label: '신분증', icon: Contact },
  BANKBOOK_COPY: { label: '통장 사본', icon: Landmark },
  BUSINESS_REGISTRATION: { label: '사업자등록증', icon: FileCheck },
  TELESALES_REPORT: { label: '통신판매업 신고증', icon: ScrollText },
  CORP_REGISTER: { label: '법인 등기부등본', icon: FileText },
  CORP_SEAL: { label: '법인 인감증명서', icon: Stamp },
}

/** 모르는 documentType은 서버가 값을 늘린 경우라 이름을 그대로 노출한다(조용히 숨기지 않는다). */
export function toDocumentMeta(documentType: string): {
  label: string
  icon: DocumentIconComponent
} {
  return DOCUMENT_META[documentType] ?? { label: documentType, icon: FileText }
}

// ── 6. 반려 사유 — 화면 슬러그 ↔ 서버 자유 문자열 ──────────────────────────────

export const REJECTION_REASON_DIRECT = 'direct'
export const REJECTION_REASON_MAX_LENGTH = 500

export const REJECTION_REASON_PRESETS: { value: string; label: string }[] = [
  { value: 'doc-mismatch', label: '통신판매업 신고증 불일치' },
  { value: 'invalid-business', label: '사업자 정보 확인 불가' },
  { value: 'incomplete-docs', label: '서류 누락' },
]

export const REJECTION_REASON_OPTIONS = [
  ...REJECTION_REASON_PRESETS,
  { value: REJECTION_REASON_DIRECT, label: '직접 입력' },
]

/** 화면의 반려 사유 입력 상태. value가 빈 문자열이면 아직 고르지 않은 것이다. */
export interface RejectionReasonDraft {
  value: string
  text: string
}

/**
 * 서버가 준 자유 문자열을 화면 상태로 되돌린다. 프리셋 라벨과 정확히 같으면 그 슬러그를 고르고,
 * 아니면 '직접 입력'으로 떨어뜨려 원문을 그대로 보여 준다 — 슬러그에 없는 사유를 조용히
 * 버리면 운영자가 직전 반려 사유를 못 보게 된다.
 */
export function toRejectionReasonDraft(reason: string | null | undefined): RejectionReasonDraft {
  const text = reason?.trim() ?? ''
  if (text === '') return { value: '', text: '' }
  const preset = REJECTION_REASON_PRESETS.find(option => option.label === text)
  if (preset) return { value: preset.value, text: '' }
  return { value: REJECTION_REASON_DIRECT, text }
}

/** 서버로 보낼 자유 문자열. 프리셋은 라벨 문구가 그대로 사유가 된다. */
export function toRejectionReasonText(draft: RejectionReasonDraft): string {
  if (draft.value === REJECTION_REASON_DIRECT) return draft.text.trim()
  return REJECTION_REASON_PRESETS.find(option => option.value === draft.value)?.label ?? ''
}

/** 제출 버튼을 열어도 되는지 — 서버의 400(공백 10102·500자 초과 90001)을 화면에서 먼저 막는다. */
export function isRejectionReasonReady(draft: RejectionReasonDraft): boolean {
  const text = toRejectionReasonText(draft)
  return text !== '' && text.length <= REJECTION_REASON_MAX_LENGTH
}

// ── 응답 → 뷰 ─────────────────────────────────────────────────────────────────

export function toApplicationRow(summary: AdminApplicationSummary): ApplicationRowView {
  return {
    id: String(summary.applicationId),
    applicationId: summary.applicationId,
    applicantName: toApplicantName(summary.businessName, summary.representativeName),
    sellerType: toSellerType(summary.businessType),
    status: toScreenStatus(summary.status),
    submittedAt: summary.submittedAt,
  }
}

const REVIEW_LABEL: Record<string, string> = { APPROVED: '승인', REJECTED: '반려' }

export function toApplicationDetail(detail: AdminApplicationDetail): ApplicationDetailView {
  const reviews = detail.reviews.map(review => ({
    label: REVIEW_LABEL[review.decision] ?? review.decision,
    date: formatWireDateTime(review.reviewedAt),
    rejectionReason: review.rejectionReason,
  }))
  const lastRejection = [...detail.reviews]
    .reverse()
    .find(review => review.decision === 'REJECTED')
  return {
    applicationId: detail.applicationId,
    status: toScreenStatus(detail.status),
    sellerType: toSellerType(detail.businessType),
    applicantName: toApplicantName(detail.businessName, detail.representativeName),
    representativeNameMasked: maskPersonName(detail.representativeName),
    businessRegNoMasked: maskBusinessRegNo(detail.businessRegNo),
    appliedAt: detail.appliedAt,
    submittedAt: detail.submittedAt,
    rejectionReason: detail.rejectionReason,
    lastRejectionReason: detail.rejectionReason ?? lastRejection?.rejectionReason ?? null,
    // 콜백 파라미터를 document로 지으면 전역 document를 가린다 — doc으로 쓴다.
    documents: detail.documents.map(doc => ({
      documentType: doc.documentType,
      ...toDocumentMeta(doc.documentType),
      downloadUrl: doc.downloadUrl,
    })),
    reviews,
  }
}

// ── 에러 분기 ─────────────────────────────────────────────────────────────────
// axios 타입을 끌어오지 않으려고 duck-typing으로 읽는다(web-seller store-settings 관례).
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

/**
 * 409는 errorCode 10101(상태 가드·낙관적 잠금·유니크 충돌)과 90003(공용 충돌)을 같이 다룬다 —
 * 둘 다 "이미 처리되었거나 다른 운영자가 먼저 처리함"이라 재조회가 답이다.
 */
export function isStaleDecision(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  if (status === 409) return errorCode === 10101 || errorCode === 90003 || errorCode == null
  // 신청이 사라졌을 때도 화면이 들고 있는 목록이 낡았다는 뜻이라 같은 재조회 경로를 탄다.
  return status === 404 && errorCode === 10100
}

export const isForbidden = (error: unknown): boolean => toWireError(error).status === 403

export function decisionErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isStaleDecision(error)) {
    return status === 404
      ? '신청을 찾을 수 없어요. 목록을 다시 불러왔어요.'
      : '이미 처리된 신청이에요. 다른 운영자가 먼저 처리했을 수 있어 목록을 다시 불러왔어요.'
  }
  if (status === 400 && errorCode === 10102) return '반려 사유를 입력해 주세요.'
  if (status === 400 && errorCode === 90001)
    return `반려 사유는 ${REJECTION_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`
  if (isForbidden(error)) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isForbidden(error)) return '어드민 권한이 없어 심사 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 90001) return '상태 필터 값을 서버가 알지 못해요. 필터를 다시 선택해 주세요.'
  return '심사 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 상세 조회 실패용 문구. 목록 문구를 재사용하면 목록은 정상인데 상세만 깨진 상황에서 틀린
 * 대상을 지목한다. 404(errorCode 10100)는 BE AdminSellerReviewService.getById의 분기다.
 */
export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbidden(error)) return '어드민 권한이 없어 신청 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '신청을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '신청 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

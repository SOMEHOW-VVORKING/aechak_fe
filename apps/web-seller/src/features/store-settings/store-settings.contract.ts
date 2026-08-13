import type {
  BusinessType,
  SaveSellerApplicationDraftRequest,
  SellerApplicationDetail,
  SellerDocumentType,
} from '@aechak/api'
import type { SellerApplication, SellerApplicationStatus, SellerLegalType } from '@aechak/domain'

// BE 입점 신청 계약(ApplicationResponse/SaveDraftRequest)과 화면 사이의 순수 매핑·규칙.
// 서버 enum(BusinessType/ApplicationStatus/DocumentType)이 feature 밖으로 새지 않게 여기 가둔다
// (breeds 연동의 종 매핑 관례). 훅은 store-settings.queries.ts, 업로드는 store-settings.upload.ts.

const STATUS_FROM_WIRE: Record<SellerApplicationDetail['status'], SellerApplicationStatus> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
}

const LEGAL_TYPE_FROM_WIRE: Record<BusinessType, SellerLegalType> = {
  PERSONAL_GENERAL: 'individual',
  SOLE_PROPRIETORSHIP: 'individual-business',
  CORPORATE: 'corporate-business',
}

export const LEGAL_TYPE_TO_WIRE: Record<SellerLegalType, BusinessType> = {
  individual: 'PERSONAL_GENERAL',
  'individual-business': 'SOLE_PROPRIETORSHIP',
  'corporate-business': 'CORPORATE',
}

// 서버 DocumentType.label과 동일한 한국어 — 10105 message의 라벨과도 일치한다.
export const DOCUMENT_LABEL: Record<SellerDocumentType, string> = {
  ID_CARD: '신분증',
  BANKBOOK_COPY: '통장 사본',
  BUSINESS_REGISTRATION: '사업자등록증',
  TELESALES_REPORT: '통신판매업 신고증',
  CORP_REGISTER: '법인 등기부등본',
  CORP_SEAL: '법인 인감증명서',
}

// BE 제출 검증(10105)의 유형별 필수 서류 표 미러 — 부족 목록이 message 문자열로만 와서
// 파싱이 취약하므로 클라이언트가 같은 표를 보유하고 제출 전에 미리 판정한다.
export const REQUIRED_DOCUMENTS: Record<SellerLegalType, SellerDocumentType[]> = {
  individual: ['ID_CARD', 'BANKBOOK_COPY'],
  'individual-business': ['ID_CARD', 'BANKBOOK_COPY', 'BUSINESS_REGISTRATION', 'TELESALES_REPORT'],
  'corporate-business': [
    'ID_CARD',
    'BANKBOOK_COPY',
    'BUSINESS_REGISTRATION',
    'TELESALES_REPORT',
    'CORP_REGISTER',
    'CORP_SEAL',
  ],
}

// 화면 폼 상태. accountNumber는 평문 입력 전용 — 응답은 accountNumberMasked만 오므로
// (BE가 평문을 절대 돌려주지 않음) 저장할 때마다 다시 입력해야 한다(전체 덮어쓰기 계약).
export interface SellerApplicationFormValue {
  legalType: SellerLegalType
  representativeName: string
  businessName: string
  businessRegNo: string
  corpRegNo: string
  telesalesNumber: string
  bankCode: string
  accountNumber: string
  accountHolder: string
}

export function emptyFormValue(): SellerApplicationFormValue {
  return {
    legalType: 'individual',
    representativeName: '',
    businessName: '',
    businessRegNo: '',
    corpRegNo: '',
    telesalesNumber: '',
    bankCode: '',
    accountNumber: '',
    accountHolder: '',
  }
}

/** 서버 신청서로 폼을 시드한다. 계좌번호는 마스킹만 와서 항상 빈 값(placeholder로 안내). */
export function formValueFrom(application: SellerApplication): SellerApplicationFormValue {
  return {
    legalType: application.legalType,
    representativeName: application.representativeName ?? '',
    businessName: application.businessName ?? '',
    businessRegNo: application.businessRegNo ?? '',
    corpRegNo: application.corpRegNo ?? '',
    telesalesNumber: application.telesalesNumber ?? '',
    bankCode: application.bankCode ?? '',
    accountNumber: '',
    accountHolder: application.accountHolder ?? '',
  }
}

export function toSellerApplication(wire: SellerApplicationDetail): SellerApplication {
  return {
    id: String(wire.applicationId),
    status: STATUS_FROM_WIRE[wire.status],
    legalType: LEGAL_TYPE_FROM_WIRE[wire.businessType],
    businessName: wire.businessName ?? undefined,
    businessRegNo: wire.businessRegNo ?? undefined,
    corpRegNo: wire.corpRegNo ?? undefined,
    representativeName: wire.representativeName ?? undefined,
    telesalesNumber: wire.telesalesNumber ?? undefined,
    bankCode: wire.bankCode ?? undefined,
    accountNumberMasked: wire.accountNumberMasked ?? undefined,
    accountHolder: wire.accountHolder ?? undefined,
    appliedAt: wire.appliedAt,
    submittedAt: wire.submittedAt ?? undefined,
    decidedAt: wire.decidedAt ?? undefined,
    rejectionReason: wire.rejectionReason ?? undefined,
    documents: wire.documents.map(doc => ({
      key: doc.documentType,
      label: DOCUMENT_LABEL[doc.documentType as SellerDocumentType] ?? doc.documentType,
      uploadedAt: doc.uploadedAt,
    })),
  }
}

function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface SaveDraftInput {
  form: SellerApplicationFormValue
  documents: { documentType: SellerDocumentType; tmpKey: string }[]
}

/** 폼 → 임시저장 요청. 전체 덮어쓰기 계약이라 폼 필드 전부를 싣는다(빈 값은 null = 소거). */
export function toSaveDraftRequest(input: SaveDraftInput): SaveSellerApplicationDraftRequest {
  const { form, documents } = input
  return {
    businessType: LEGAL_TYPE_TO_WIRE[form.legalType],
    businessName: nullable(form.businessName),
    businessRegNo: nullable(form.businessRegNo),
    corpRegNo: nullable(form.corpRegNo),
    representativeName: nullable(form.representativeName),
    telesalesNumber: nullable(form.telesalesNumber),
    bankCode: nullable(form.bankCode),
    accountNumber: nullable(form.accountNumber),
    accountHolder: nullable(form.accountHolder),
    documents,
  }
}

// BE 제출 검증(requireSubmittable)의 유형별 필수 필드 표 미러. telesalesNumber는 어느 유형에서도
// 필수 필드가 아니다(서류 TELESALES_REPORT만 필수 — BE와 동일).
const REQUIRED_FIELD_LABELS: { label: string; read: (form: SellerApplicationFormValue) => string }[] = [
  { label: '대표자명', read: form => form.representativeName },
  { label: '은행', read: form => form.bankCode },
  { label: '계좌번호', read: form => form.accountNumber },
  { label: '예금주', read: form => form.accountHolder },
]

const BUSINESS_FIELD_LABELS: typeof REQUIRED_FIELD_LABELS = [
  { label: '상호명', read: form => form.businessName },
  { label: '사업자등록번호', read: form => form.businessRegNo },
]

const CORPORATE_FIELD_LABELS: typeof REQUIRED_FIELD_LABELS = [
  { label: '법인등록번호', read: form => form.corpRegNo },
]

/**
 * 제출 전 부족한 필수 정보·서류 라벨. 서버 10105와 같은 기준 — 계좌번호는 응답이 마스킹뿐이라
 * 저장(전체 덮어쓰기)마다 폼에 다시 입력돼 있어야 하므로 폼 값 기준으로만 판정한다.
 */
export function missingRequirements(
  form: SellerApplicationFormValue,
  providedDocumentTypes: ReadonlySet<string>,
): string[] {
  const fieldRules = [
    ...REQUIRED_FIELD_LABELS,
    ...(form.legalType !== 'individual' ? BUSINESS_FIELD_LABELS : []),
    ...(form.legalType === 'corporate-business' ? CORPORATE_FIELD_LABELS : []),
  ]
  const missingFields = fieldRules.filter(rule => rule.read(form).trim() === '').map(rule => rule.label)
  const missingDocuments = REQUIRED_DOCUMENTS[form.legalType]
    .filter(type => !providedDocumentTypes.has(type))
    .map(type => DOCUMENT_LABEL[type])
  return [...missingFields, ...missingDocuments]
}

// 사업자등록번호 사전 검증 — 서버 @BusinessRegNo(하이픈 제거 10자리 + 국세청 체크섬)와 동일 규칙.
// 위반이면 서버도 400/90001로 거절하므로 저장 전에 미리 잡는다.
export function isValidBusinessRegNo(value: string): boolean {
  const digits = value.replace(/-/g, '')
  if (!/^\d{10}$/.test(digits)) return false
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  const nums = digits.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += nums[i]! * weights[i]!
  sum += Math.floor((nums[8]! * 5) / 10)
  return (10 - (sum % 10)) % 10 === nums[9]
}

// 인증/신청 에러는 errorCode로 분기한다. 10105(필수 미비)는 부족 목록이 서버 message 한 줄에
// 실려 오므로 그대로 보여준다. axios 타입을 안 끌어오려고 duck-typing.
export function sellerApplicationErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { errorCode?: number; message?: string } } })
    ?.response?.data
  switch (data?.errorCode) {
    case 10103:
      return '휴대폰 본인 인증이 필요해요. 구매자 앱 마이페이지에서 인증한 뒤 다시 시도해 주세요.'
    case 10001:
      return '이미 셀러로 등록된 계정이에요.'
    case 10101:
      return '지금 신청 상태에서는 수정할 수 없어요. 화면을 새로고침해 주세요.'
    case 10104:
      return '이미 진행 중인 입점 신청이 있어요. 화면을 새로고침해 주세요.'
    case 10100:
      return '입점 신청을 찾을 수 없어요. 화면을 새로고침해 주세요.'
    case 10105:
      return data?.message ?? '필수 정보·서류를 확인해 주세요.'
    case 100001:
      return '서류 파일 업로드가 완료되지 않았어요. 파일을 다시 올려 주세요.'
    case 100002:
    case 100003:
      return '서류 파일을 확인할 수 없어요. 파일을 다시 올려 주세요.'
    default:
      return data?.message ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

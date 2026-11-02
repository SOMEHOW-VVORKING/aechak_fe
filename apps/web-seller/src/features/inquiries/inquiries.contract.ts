// 셀러 상품 문의 BE(`boot/seller/.../inquiry/SellerInquiryController`)와 화면 사이의 순수
// 타입·매핑·규칙. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만
// 붙인다 — OpenAPI 스펙이 바뀌면 재생성만으로 여기서 타입 오류가 드러난다. 서버 enum은 이 feature
// 밖으로 새지 않게 여기 가둔다(claims.contract·products.contract 관례).
//
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-10-26T09:14:00)이다.
import type { StatusPillVariant } from '@aechak/design-system/web'
import type {
  GetSellerInquiriesParams,
  ProductInquiryCategory,
  ProductInquiryStatus,
  SellerInquiryStatusFilter,
} from '@aechak/api'

export type {
  /** 목록 한 행. 지표·기한 판정이 모두 서버 계산값이다. */
  SellerInquirySummary,
  SellerInquiryAnswer,
  SellerInquiryMetrics,
  SellerInquiryListData,
  ProductInquiryCategory,
  ProductInquiryStatus,
  SellerInquiryStatusFilter,
} from '@aechak/api'

// ─── 목록 파라미터 ───────────────────────────────────────────────────────────
// GET /sellers/me/inquiries. 정렬 파라미터가 없다(문의 id 내림차순 고정).

export type SellerInquirySearchParams = GetSellerInquiriesParams

/**
 * 화면 필터 상태 그대로의 목록 파라미터 — '전체'를 빈 문자열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeInquirySearchParams`가 한 곳에서 책임진다.
 */
export type SellerInquirySearchInput = {
  [K in keyof SellerInquirySearchParams]?: NonNullable<SellerInquirySearchParams[K]> | ''
}

/**
 * 빈 값 파라미터를 키째 빼고 문자열을 trim한다.
 *
 * 서버는 값이 빈 파라미터를 미입력으로 보지 않는다 — `?status=`·`?category=`는 enum 바인딩이
 * 터져 400 errorCode 90001이 된다. 화면 탭·필터는 '전체'를 빈 문자열로 들고 있으므로 그대로
 * 넘기면 전 목록 조회가 400으로 깨진다. 숫자 0(`page=0`)은 값이 있는 것이므로 남긴다.
 */
export function normalizeInquirySearchParams(
  input: SellerInquirySearchInput,
): SellerInquirySearchParams {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input) as [string, unknown][]) {
    if (value == null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') normalized[key] = trimmed
      continue
    }
    normalized[key] = value
  }
  return normalized as SellerInquirySearchParams
}

// ─── 어휘 라벨 ───────────────────────────────────────────────────────────────

/**
 * 서버 상태 어휘는 '접수'(RECEIVED)이고 화면 라벨은 '답변 대기'다.
 * WITHDRAWN은 셀러 목록에 내려오지 않지만 enum이 전수라 라벨을 비워 둘 수 없다.
 */
export const INQUIRY_STATUS_LABEL: Record<ProductInquiryStatus, string> = {
  RECEIVED: '답변 대기',
  ANSWERED: '답변 완료',
  WITHDRAWN: '구매자 철회',
}

export const INQUIRY_STATUS_VARIANT: Record<ProductInquiryStatus, StatusPillVariant> = {
  RECEIVED: 'warning',
  ANSWERED: 'success',
  WITHDRAWN: 'muted',
}

export const INQUIRY_CATEGORY_LABEL: Record<ProductInquiryCategory, string> = {
  PRODUCT: '상품',
  DELIVERY: '배송',
  CLAIM: '취소/반품/교환',
  ETC: '기타',
}

/** 상태 탭 — '전체'는 status 파라미터를 보내지 않는 것이다(철회는 어느 탭에도 없다). */
export type InquiryStatusTab = 'ALL' | SellerInquiryStatusFilter

export const INQUIRY_STATUS_TABS: readonly InquiryStatusTab[] = ['ALL', 'RECEIVED', 'ANSWERED']

export const INQUIRY_TAB_LABEL: Record<InquiryStatusTab, string> = {
  ALL: '전체',
  RECEIVED: '답변 대기',
  ANSWERED: '답변 완료',
}

// ─── 날짜 표시 ───────────────────────────────────────────────────────────────

/** `2026-10-26T09:14:00` → `2026-10-26 09:14`. 오프셋 없는 벽시계라 Date로 파싱하지 않는다. */
export function formatInquiryDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

/** 목록 표의 날짜 칸 — 앞 10자만. */
export function formatInquiryDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '—'
}

// ─── 에러 문구 ───────────────────────────────────────────────────────────────
// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).
// 조회와 답변의 자격 게이트가 다르다 — 읽기는 휴점·탈퇴신청 셀러에게 열려 있고 답변은 ACTIVE만
// 통과하므로, 휴점 셀러는 목록은 보이는데 답변에서 120112를 받는다.
const ERROR_MESSAGE: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  120100: '문의를 찾을 수 없어요. 목록을 새로 불러와 주세요.',
  120105: '답변 내용을 적어 주세요.',
  120106: '답변은 2,000자까지 보낼 수 있어요.',
  120108: '내 상품에 온 문의만 답변할 수 있어요.',
  120109: '이미 답변한 문의예요. 목록을 새로 불러와 주세요.',
  120112: '지금 계정 상태로는 답변을 보낼 수 없어요.',
  120114: '구매자가 철회한 문의예요. 목록을 새로 불러와 주세요.',
}

const FALLBACK_MESSAGE = '문의를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'

/** errorCode를 모르는 실패(네트워크·5xx)도 문구를 받는다 — 빈 상태로 떨어뜨리지 않는다. */
export function inquiryErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } } | null | undefined)?.response?.data
    ?.errorCode
  return (code !== undefined && ERROR_MESSAGE[code]) || FALLBACK_MESSAGE
}

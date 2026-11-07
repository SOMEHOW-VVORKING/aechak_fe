import type {
  AdminInquiryDetailData,
  AdminInquiryStatus,
  AdminInquirySummary,
  AdminInquiryType,
} from '@aechak/api'
import type { HistoryEntry } from '@aechak/domain'

// 와이어 enum·필드는 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 view 타입 어휘만 쓰고,
// 서버 InquiryStatus·InquiryType은 여기서만 등장한다.

/** 화면 어휘의 처리 상태. 서버 4값과 1:1이다(FE가 만들어 낸 값이 없다). */
export type InquiryStatusValue = 'received' | 'in-progress' | 'done' | 'on-hold'

/** 화면 어휘의 문의 유형. 서버 5값과 1:1이다. */
export type InquiryTypeValue = 'account' | 'order-payment' | 'delivery-claim' | 'seller-product' | 'etc'

const STATUS_FROM_WIRE: Record<AdminInquiryStatus, InquiryStatusValue> = {
  RECEIVED: 'received',
  IN_PROGRESS: 'in-progress',
  DONE: 'done',
  ON_HOLD: 'on-hold',
}

const STATUS_TO_WIRE: Record<InquiryStatusValue, AdminInquiryStatus> = {
  received: 'RECEIVED',
  'in-progress': 'IN_PROGRESS',
  done: 'DONE',
  'on-hold': 'ON_HOLD',
}

const TYPE_FROM_WIRE: Record<AdminInquiryType, InquiryTypeValue> = {
  ACCOUNT: 'account',
  ORDER_PAYMENT: 'order-payment',
  DELIVERY_CLAIM: 'delivery-claim',
  SELLER_PRODUCT: 'seller-product',
  SERVICE_ETC: 'etc',
}

const TYPE_TO_WIRE: Record<InquiryTypeValue, AdminInquiryType> = {
  account: 'ACCOUNT',
  'order-payment': 'ORDER_PAYMENT',
  'delivery-claim': 'DELIVERY_CLAIM',
  'seller-product': 'SELLER_PRODUCT',
  etc: 'SERVICE_ETC',
}

export const statusToWire = (value: InquiryStatusValue): AdminInquiryStatus => STATUS_TO_WIRE[value]
export const typeToWire = (value: InquiryTypeValue): AdminInquiryType => TYPE_TO_WIRE[value]

/**
 * 운영자가 **답변 없이** 옮길 수 있는 상태. 서버 Inquiry.MANUAL_TRANSITION_TARGETS와 같은 집합이다 —
 * RECEIVED는 접수 초기값이라 되돌아갈 자리가 아니고 DONE으로 가는 길은 답변 등록뿐이다.
 * 여기에 다른 값을 넣으면 누르는 즉시 409(120009)로 돌아온다.
 */
export const MANUAL_STATUS_TARGETS = ['in-progress', 'on-hold'] as const satisfies readonly InquiryStatusValue[]

export type ManualStatusTarget = (typeof MANUAL_STATUS_TARGETS)[number]

export interface AdminInquiryRow {
  inquiryId: number
  type: InquiryTypeValue
  status: InquiryStatusValue
  /** 탈퇴 계정은 서버가 익명 표기로 바꿔 내려준다 — null이 아니다. */
  authorNickname: string
  authorWithdrawn: boolean
  /** 문의에 제목이 없어 내용 앞머리가 제목 자리를 쓴다. */
  contentPreview: string
  receivedAt: string
  resolvedAt: string | null
  assignedAdminId: number | null
  answeredByAdminId: number | null
}

export interface AdminInquiryDetailView extends AdminInquiryRow {
  content: string
  replyEmail: string
  answer: string | null
  previousInquiries: HistoryEntry[]
}

export function toInquiryRow(wire: AdminInquirySummary): AdminInquiryRow {
  return {
    inquiryId: wire.inquiryId,
    type: TYPE_FROM_WIRE[wire.inquiryType],
    status: STATUS_FROM_WIRE[wire.status],
    authorNickname: wire.author.nickname,
    authorWithdrawn: wire.author.withdrawn,
    contentPreview: wire.contentPreview,
    receivedAt: wire.receivedAt,
    resolvedAt: wire.resolvedAt,
    assignedAdminId: wire.assignedAdminId,
    answeredByAdminId: wire.answeredByAdminId,
  }
}

/** 이전 문의 이력의 한 줄 라벨 — 유형과 처리 상태를 함께 읽어야 "같은 건으로 또 왔다"가 보인다. */
export const INQUIRY_TYPE_LABELS: Record<InquiryTypeValue, string> = {
  account: '계정',
  'order-payment': '주문/결제',
  'delivery-claim': '배송/클레임',
  'seller-product': '셀러/상품',
  etc: '기타',
}

export const INQUIRY_STATUS_LABELS: Record<InquiryStatusValue, string> = {
  received: '답변 대기',
  'in-progress': '확인 중',
  done: '답변 완료',
  'on-hold': '보류',
}

export function toInquiryDetailView(wire: AdminInquiryDetailData): AdminInquiryDetailView {
  return {
    inquiryId: wire.inquiryId,
    type: TYPE_FROM_WIRE[wire.inquiryType],
    status: STATUS_FROM_WIRE[wire.status],
    authorNickname: wire.author.nickname,
    authorWithdrawn: wire.author.withdrawn,
    // 상세에는 미리보기가 없다 — 전문의 앞머리를 같은 자리에 쓴다(드로어 부제).
    contentPreview: wire.content,
    receivedAt: wire.receivedAt,
    resolvedAt: wire.resolvedAt,
    assignedAdminId: wire.assignedAdminId,
    answeredByAdminId: wire.answeredByAdminId,
    content: wire.content,
    replyEmail: wire.replyEmail,
    answer: wire.answer,
    previousInquiries: wire.previousInquiries.map(previous => ({
      label: `${INQUIRY_TYPE_LABELS[TYPE_FROM_WIRE[previous.inquiryType]]} / ${
        INQUIRY_STATUS_LABELS[STATUS_FROM_WIRE[previous.status]]
      }`,
      date: toDateLabel(previous.receivedAt),
    })),
  }
}

/** 오프셋 없는 LocalDateTime의 날짜 부분. 이력 줄은 날짜 단위로 읽는다. */
export const toDateLabel = (isoLocal: string): string => isoLocal.slice(0, 10)

/** 목록의 접수 시각 — `MM-DD HH:mm`. 연도는 목록에서 읽히지 않아 떼고 상세 날짜는 전체를 쓴다. */
export const toDateTimeLabel = (isoLocal: string): string =>
  `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`

/**
 * 접수 후 지난 시간(시간 단위).
 *
 * 서버가 **오프셋 없는 LocalDateTime**을 주므로 브라우저 로컬 시각으로 읽는다 — 운영자 브라우저와
 * 서버가 같은 시간대(KST)라는 전제다. `new Date(iso)`는 오프셋이 없는 문자열을 로컬로 해석하므로
 * 그 전제와 맞고, `Z`를 붙여 UTC로 읽으면 9시간이 어긋난다.
 * 시계 역행·수동 보정으로 음수가 나오면 0으로 끊는다(경과가 마이너스로 보이면 읽을 수 없다).
 */
export function elapsedHoursSince(isoLocal: string, now: number): number {
  const received = new Date(isoLocal).getTime()
  if (Number.isNaN(received)) return 0
  return Math.max(0, Math.floor((now - received) / 3_600_000))
}

/** 접수 24시간이 지나도록 답변이 안 나간 문의는 운영자가 먼저 봐야 한다. */
export const DELAY_THRESHOLD_HOURS = 24

export function isDelayed(row: AdminInquiryRow, now: number): boolean {
  if (row.status === 'done') return false
  return elapsedHoursSince(row.receivedAt, now) >= DELAY_THRESHOLD_HOURS
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
    return '어드민 권한이 없어 문의 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400 && errorCode === 90002)
    return '목록 조건이 바뀌었어요. 필터를 다시 선택해 처음부터 불러와 주세요.'
  return '문의 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 문의 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '문의를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '문의 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 답변 등록·상태 전이 실패 문구. 409 둘은 운영자가 할 일이 서로 달라 한 문구로 묶지 않는다 —
 * 이미 답변된 문의는 손댈 것이 없고, 전이 거부는 지금 상태에서 갈 수 없는 곳을 고른 것이다.
 */
export function writeErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 409 && errorCode === 120008)
    return '이미 답변이 등록된 문의예요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 120009)
    return '지금 상태에서는 그 상태로 옮길 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 400 && errorCode === 120006) return '답변 내용을 입력해 주세요.'
  if (status === 400 && errorCode === 120007) return '답변은 1,000자를 넘을 수 없어요.'
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '문의를 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 답변 내용을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

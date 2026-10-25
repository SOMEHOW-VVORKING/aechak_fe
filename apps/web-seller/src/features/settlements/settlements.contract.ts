import type { StatusPillVariant } from '@aechak/design-system/web'
import { errorResponse, SellerSettlementStatus } from '@aechak/api'
import type {
  SellerSettlementDetailData,
  SellerSettlementItem,
  SellerSettlementStatus as SettlementStatus,
  SellerSettlementSummary,
} from '@aechak/api'

// 정산은 조회 전용이라 변환할 폼이 없다 — 이 파일이 맡는 것은 **표시 형식과 어휘**뿐이다.
//
// **금액은 손대지 않는다.** 서버가 주는 값은 원 단위 정수(Long)이고 지급 예정액은 저장된 원장
// 값이다. 화면이 productAmount - feeAmount로 다시 계산하거나 단위를 바꾸거나 반올림하면 셀러가
// 보는 금액이 원장과 어긋난다(`finalAmount`는 배송비가 더해지고 쿠폰 부담·환불 차감이 빠진 값이라
// productAmount - feeAmount와 애초에 같지 않다).

export type { SettlementStatus }

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: '정산 대기',
  scheduled: '정산 예정',
  completed: '정산 완료',
  held: '정산 보류',
}

export const SETTLEMENT_STATUS_VARIANT: Record<SettlementStatus, StatusPillVariant> = {
  pending: 'neutral',
  scheduled: 'info',
  completed: 'success',
  held: 'warning',
}

/** 상태 필터 선택지 — '전체'는 status 파라미터를 보내지 않는 것으로 표현한다(빈 문자열). */
export const SETTLEMENT_STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  ...Object.values(SellerSettlementStatus).map(status => ({
    value: status,
    label: SETTLEMENT_STATUS_LABEL[status],
  })),
]

export const ALL_MONTHS = ''

/** 월 선택지 — 서버가 준 정산월만 올린다(없는 달을 지어내지 않는다). */
export function monthSelectOptions(months: string[] | undefined) {
  return [
    { value: ALL_MONTHS, label: '전체 기간' },
    ...(months ?? []).map(month => ({ value: month, label: formatMonth(month) })),
  ]
}

/** `2026-06` → `2026.06`. 형식이 다르면 서버 값을 그대로 보여 준다(지어내지 않는다). */
export function formatMonth(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? month.replace('-', '.') : month
}

/** 금액 표시. 값은 원 단위 정수 그대로이고 천 단위 구분만 넣는다. */
export const formatWon = (value: number): string => `${value.toLocaleString('ko-KR')}원`

/** 차감 항목은 0원이면 부호를 붙이지 않는다(`-0원`은 읽히지 않는다). */
export const formatDeduction = (value: number): string =>
  value > 0 ? `-${formatWon(value)}` : formatWon(value)

/** LocalDateTime(`2026-06-18T10:00:00`) → `2026.06.18`. 구매확정 전이면 null이 온다. */
export function formatDateTime(value: string | null): string {
  if (value == null) return '-'
  const [date] = value.split('T')
  return date ? date.replaceAll('-', '.') : value
}

/** LocalDate(`2026-06-23`) → `2026.06.23`. */
export const formatDate = (value: string): string => value.replaceAll('-', '.')

/**
 * 요율 스냅샷을 백분율 문구로. 서버는 비율을 DECIMAL(5,4)로 들고 있고 자릿수까지 그대로
 * 내려 주지만(`0.0800`) JSON 수로 파싱되면 scale이 사라진다. scale 4가 서버의 정밀도 전부이므로
 * 그 자리에서 끊는 것은 정보를 버리지 않는다 — 부동소수 오차(0.028 * 100 = 2.8000000000000003)만
 * 떼어 내고, 남는 0은 붙이지 않는다(8% / 2.8%).
 *
 * 금액에는 이 함수를 쓰지 않는다. 금액은 서버가 준 정수를 그대로 보여 준다.
 */
export function formatFeeRate(rate: number): string {
  const percent = Math.round(rate * 10_000) / 100
  return `${percent}%`
}

/** 품목 내역의 열 머리글 묶음 — 상세 Drawer가 쓰는 순서가 금액 분해 순서와 같아야 한다. */
export interface SettlementItemRow {
  item: SellerSettlementItem
  /** 상품명이 없으면(스냅샷 유실) 품목 식별자로 대체한다 — 빈 칸을 남기지 않는다. */
  name: string
  quantityLabel: string
}

export function settlementItemRows(detail: SellerSettlementDetailData): SettlementItemRow[] {
  return detail.items.map(item => ({
    item,
    name: item.productName ?? `품목 ${item.orderItemId}`,
    quantityLabel: item.quantity == null ? '-' : `${item.quantity}개`,
  }))
}

/** 목록·상세가 같은 요약을 쓰므로 상세에서 요약만 떼어 쓸 수 있다. */
export const summaryOf = (detail: SellerSettlementDetailData): SellerSettlementSummary => detail

/**
 * 목록 조회 실패 안내. 표의 빈 상태로 흘리지 않기 위해 사유를 따로 말한다 — 500과
 * "조건에 맞는 내역 없음"이 같은 문구로 보이면 셀러는 필터를 의심한다.
 *
 * 90001(월·상태 형식)은 `normalizeSearchParams`가 빈 값을 키째 빼므로 정상 동선에서는 안 나온다 —
 * 나오면 FE 버그 신호라 "다시 골라 달라"고 말한다.
 */
export function settlementListErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 90001:
      return '조회 조건이 올바르지 않아요. 기간과 상태를 다시 골라 주세요.'
    case 10000:
      return '셀러 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.'
    default:
      return '정산 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

/** 상세 조회 실패 안내. 서버 격식체 문구는 싣지 않는다(앱 전체 -해요체). */
export function settlementDetailErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 70002:
      return '이 주문의 정산 내역을 찾을 수 없어요. 목록을 새로고침해 주세요.'
    case 70003:
      return '이 주문의 정산을 볼 권한이 없어요.'
    default:
      return '정산 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

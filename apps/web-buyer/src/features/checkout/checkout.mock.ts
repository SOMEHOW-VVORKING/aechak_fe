import type { PaymentMethod } from '@aechak/domain'

// 주문서(b1-st-4) 목업 상수·계산. 쿠폰/정기배송은 범위 밖 — 적립금 적용만 다룬다.

// 목업 결제 수단 3종(카카오/토스/카드). 실제 PG 연동은 범위 밖.
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'kakaopay', label: '카카오페이' },
  { value: 'tosspay', label: '토스페이' },
  { value: 'card', label: '신용 / 체크카드' },
]

// 보유 적립금(목업 고정값).
export const POINT_BALANCE = 1200

// 사용 가능한 최대 적립금 = min(보유, 적립금 적용 전 결제금액).
export function maxUsablePoints(payableBeforePoints: number, balance = POINT_BALANCE): number {
  return Math.min(balance, Math.max(0, payableBeforePoints))
}

// 입력 적립금을 [0, 최대] 범위로 정규화한다.
export function clampPoints(
  input: number,
  payableBeforePoints: number,
  balance = POINT_BALANCE,
): number {
  if (!Number.isFinite(input) || input <= 0) return 0
  return Math.min(Math.round(input), maxUsablePoints(payableBeforePoints, balance))
}

// 최종 결제금액 = 상품금액 + 배송비 − 적립금(0 미만으로 내려가지 않음).
export function finalPayable(itemsTotal: number, shippingTotal: number, points: number): number {
  return Math.max(0, itemsTotal + shippingTotal - points)
}

import type { PaymentMethod } from '@aechak/domain'

// 주문서(b1-st-4) 목업 상수·계산. 쿠폰/정기배송은 범위 밖 — 적립금 적용만 다룬다.
// 보유 적립금은 더 이상 목업 고정값이 아니라 GET /users/me/points 실서버 잔액이다(shared/points).
// 아래 순수 함수는 잔액을 인자로 받아 계산만 한다 — 주문 자체는 아직 목업이다.

// 목업 결제 수단 3종(카카오/토스/카드). 실제 PG 연동은 범위 밖.
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'kakaopay', label: '카카오페이' },
  { value: 'tosspay', label: '토스페이' },
  { value: 'card', label: '신용 / 체크카드' },
]

// ─── 적립금 사용 한도·최소 결제 금액은 서버 계약이다(여기 상수는 FE 복제본) ─────────────────
//
// 정본은 BE `domain/src/main/kotlin/com/aechak/domain/order/group/OrderGroup.kt`의
// `OrderGroup.MIN_POINT_USAGE`(1,000)·`OrderGroup.MIN_PAYMENT_AMOUNT`(100)이고, 주문 생성
// (`OrderGroup.create`)이 이 세 규칙을 강제한다 — 에러 코드는 BE
// `domain/src/main/kotlin/com/aechak/domain/order/error/OrderErrorCode.kt`에 있다.
//
//   · usedPoint가 1 이상 1,000 미만  → 400 / errorCode 50103 POINT_BELOW_MINIMUM_USAGE
//   · usedPoint > 상품금액 + 배송비   → 422 / errorCode 50102 POINT_EXCEEDS_PAYABLE_AMOUNT
//   · 최종 결제금액 < 100원           → 422 / errorCode 50108 ORDER_AMOUNT_BELOW_MINIMUM
//
// 즉 적립금은 **0원이거나 1,000원 이상**이어야 하고, 적립금을 뺀 뒤에도 **최소 100원은 남아야**
// 한다(0원 결제는 MVP 미지원). 아래 두 상수는 서버가 어차피 거절할 입력을 화면에서 미리 막기
// 위한 복제본이라, 서버가 상수를 바꾸면 조용히 어긋난다 — 어긋나면 주문 생성이 위 에러 코드로
// 드러나므로(화면에서는 결제 직전 실패) 그때 이 두 값을 정본에 다시 맞출 것.

/** 적립금 최소 사용액(원). 1~999원은 서버가 400/50103으로 거절한다. */
export const MIN_POINT_USAGE = 1_000

/** 최소 결제 금액(원, 국내 PG 신용카드 하한). 최종 결제금액이 이 값 미만이면 422/50108이다. */
export const MIN_PAYMENT_AMOUNT = 100

/**
 * 사용 가능한 최대 적립금 = min(보유 잔액, 결제금액 − 최소 결제금액).
 *
 * 결제금액 전액을 허용하면 0원 결제를 만들어 50108로 반드시 거절당하므로, 최소 결제 금액만큼은
 * 항상 남긴다. 그렇게 구한 상한이 최소 사용액(1,000원) 미만이면 서버가 받아줄 사용액이 아예 없어
 * 0을 돌려준다 — "최대 999원까지 사용 가능"은 존재할 수 없는 상태다(50103).
 */
export function maxUsablePoints(payableBeforePoints: number, balance: number): number {
  const headroom = Math.max(0, Math.floor(payableBeforePoints) - MIN_PAYMENT_AMOUNT)
  const cap = Math.min(Math.max(0, Math.floor(balance)), headroom)
  return cap < MIN_POINT_USAGE ? 0 : cap
}

/**
 * 입력 **중**(타이핑)에 쓰는 정규화 — 상한만 적용하고 하한(최소 사용액)은 건드리지 않는다.
 *
 * 입력창은 `value={String(points)}`인 완전 제어 컴포넌트라, onChange에서 하한을 강제하면 키 입력
 * 하나하나가 되튀어 1,000원대 밖 금액을 어떤 타이핑 순서로도 입력할 수 없다 — `2`가 즉시 `1000`이
 * 되고 이어 누른 `5`가 `10005`가 되므로 2,500원은 도달 불가가 된다(실제로 회귀로 들어갔던 동작이다).
 * 그래서 하한은 입력이 끝난 뒤(포커스 이탈 또는 결제 제출 직전) `clampPoints`가 한 번만 적용한다.
 */
export function clampPointsInput(
  input: number,
  payableBeforePoints: number,
  balance: number,
): number {
  const max = maxUsablePoints(payableBeforePoints, balance)
  if (max === 0) return 0
  if (!Number.isFinite(input) || input <= 0) return 0
  return Math.min(Math.round(input), max)
}

/**
 * 입력이 끝난 적립금을 서버가 받아주는 값(0 또는 [최소 사용액, 최대])으로 정규화한다.
 *
 * 1~999원은 **0으로 내린다**(최소 사용액으로 올리지 않는다). 적립금은 사용자 자산이므로, 의도한
 * 금액보다 많이 쓰게 만드는 상향이 적게 쓰는 하향보다 위험하다 — 250원을 치고 포커스를 옮긴
 * 사용자에게 1,000원을 쓰게 하면 되돌릴 수 없는 차감이 동의 없이 일어난다. 0으로 내리면 결제는
 * 그대로 성립하고 잔액은 보존되며, 왜 적용되지 않았는지는 입력창 아래 안내 문구가 설명한다.
 *
 * 입력 중에는 이 함수를 쓰지 말 것 — 하한을 매 키 입력에 강제하면 입력 자체가 막힌다
 * (`clampPointsInput` 주석 참조).
 */
export function clampPoints(input: number, payableBeforePoints: number, balance: number): number {
  const max = maxUsablePoints(payableBeforePoints, balance)
  if (max === 0) return 0
  if (!Number.isFinite(input) || input <= 0) return 0
  const rounded = Math.round(input)
  if (rounded < MIN_POINT_USAGE) return 0
  return Math.min(rounded, max)
}

// 최종 결제금액 = 상품금액 + 배송비 − 적립금(0 미만으로 내려가지 않음).
// clampPoints를 거친 적립금이면 MIN_PAYMENT_AMOUNT 이상이 남으므로 아래 하한(0)은 정규화를
// 건너뛴 직접 호출에 대한 방어선일 뿐이다 — 화면은 clampPoints/maxUsablePoints만 쓴다.
export function finalPayable(itemsTotal: number, shippingTotal: number, points: number): number {
  return Math.max(0, itemsTotal + shippingTotal - points)
}

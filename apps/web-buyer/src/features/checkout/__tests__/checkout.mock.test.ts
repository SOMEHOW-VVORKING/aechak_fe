import { describe, it, expect } from 'vitest'
import {
  MIN_PAYMENT_AMOUNT,
  MIN_POINT_USAGE,
  clampPoints,
  clampPointsInput,
  finalPayable,
  maxUsablePoints,
} from '../checkout.mock'

// 보유 잔액은 이제 순수 함수의 인자다(POINT_BALANCE 상수 제거 — 서버 잔액으로 대체됨).
// 적립금 한도는 BE `OrderGroup.create`가 강제하는 서버 계약을 그대로 따른다(근거·에러 코드는
// checkout.mock.ts 주석): 사용액은 0원이거나 1,000원 이상이어야 하고, 적립금을 뺀 뒤에도 최소
// 결제 금액 100원은 남아야 한다(0원 결제는 MVP 미지원).
const BALANCE = 1200

describe('checkout.mock 적립금 계산', () => {
  it('[AC-CHECKOUT-001] 최대 사용 적립금은 min(보유, 결제금액 − 최소 결제금액)이다', () => {
    // 결제금액이 보유보다 훨씬 크면 보유 잔액이 상한이다.
    expect(maxUsablePoints(64000, BALANCE)).toBe(BALANCE)
    // 결제금액이 작으면 최소 결제 금액(100원)을 남긴 나머지가 상한이다 — 전액은 허용하지 않는다.
    expect(maxUsablePoints(1100, BALANCE)).toBe(1_000)
  })

  it('[AC-CHECKOUT-002] 입력이 끝난 적립금은 0 또는 [최소 사용액, 최대]로 정규화된다', () => {
    expect(clampPoints(-100, 64000, BALANCE)).toBe(0)
    expect(clampPoints(0, 64000, BALANCE)).toBe(0)
    expect(clampPoints(999999, 64000, BALANCE)).toBe(BALANCE)
    expect(clampPoints(1100, 64000, BALANCE)).toBe(1100)
  })

  it('[AC-CHECKOUT-003] 전액사용(전액=최대)이 결제금액을 정확히 차감한다', () => {
    const itemsTotal = 64000
    const shipping = 0
    const points = maxUsablePoints(itemsTotal + shipping, BALANCE)
    expect(finalPayable(itemsTotal, shipping, points)).toBe(64000 - BALANCE)
  })

  it('[AC-CHECKOUT-004] 최종 결제금액 = 상품 + 배송비 − 적립금, 음수로 내려가지 않는다', () => {
    expect(finalPayable(13900, 3000, 1200)).toBe(15700)
    expect(finalPayable(1000, 0, 5000)).toBe(0)
  })

  it('[AC-CHECKOUT-008] 1~999원은 서버가 400/50103으로 거절하는 구간이라 0으로 내린다', () => {
    // usedPoint가 1 이상 1,000 미만이면 POINT_BELOW_MINIMUM_USAGE로 전건 거절된다. 이 구간을
    // 최소 사용액으로 **올리면** 사용자가 의도한 금액보다 많이 쓰게 된다 — 적립금은 사용자 자산이라
    // 동의 없는 과다 차감이 과소 차감보다 위험하므로 0으로 내리고 사유는 안내 문구가 설명한다.
    // (입력 중에 하한을 적용하지 않으므로 0으로 내려도 1,000원 입력이 막히지 않는다 → AC-CHECKOUT-012)
    expect(clampPoints(999, 64000, BALANCE)).toBe(0)
    expect(clampPoints(1, 64000, BALANCE)).toBe(0)
    expect(clampPoints(MIN_POINT_USAGE, 64000, BALANCE)).toBe(MIN_POINT_USAGE)
  })

  it('[AC-CHECKOUT-009] 전액 사용은 0원 결제를 만들지 않고 최소 결제 금액을 남긴다', () => {
    // 잔액이 결제금액보다 크면 예전 규칙의 전액 사용은 0원 결제를 만들었는데, 서버는
    // 422/50108(ORDER_AMOUNT_BELOW_MINIMUM)으로 전건 거절한다.
    const payable = 20000
    const points = maxUsablePoints(payable, 50000)
    expect(points).toBe(payable - MIN_PAYMENT_AMOUNT)
    expect(finalPayable(payable, 0, points)).toBe(MIN_PAYMENT_AMOUNT)
    // 입력으로 전액을 밀어 넣어도 같은 한도로 깎인다.
    expect(clampPoints(payable, payable, 50000)).toBe(payable - MIN_PAYMENT_AMOUNT)
  })

  it('[AC-CHECKOUT-010] 상한이 최소 사용액 미만이면 적립금을 아예 쓸 수 없다', () => {
    // 잔액이 1,000원 미만 — 999원은 서버가 거절하니 최대 999원이라는 상태는 존재할 수 없다.
    expect(maxUsablePoints(64000, 999)).toBe(0)
    // 결제금액이 작아 최소 결제 금액을 남기면 1,000원이 안 되는 경우도 같다(1,050 − 100 = 950).
    expect(maxUsablePoints(1050, BALANCE)).toBe(0)
    // 그 상태에서는 어떤 입력도 0으로 정규화된다.
    expect(clampPoints(999, 64000, 999)).toBe(0)
    expect(clampPoints(5000, 1050, BALANCE)).toBe(0)
    // 입력 중 정규화도 같다 — 쓸 수 있는 금액이 없으면 원시 입력도 통과시키지 않는다.
    expect(clampPointsInput(500, 64000, 999)).toBe(0)
  })

  it('[AC-CHECKOUT-012] 입력 중 정규화는 상한만 적용해 1,000원대 밖 금액도 타이핑할 수 있다', () => {
    // 회귀 방지: 하한을 onChange에 강제하면 `2`가 즉시 1,000이 되고 이어 누른 `5`가 10,005가 돼
    // 2,500원 같은 값에 어떤 타이핑 순서로도 도달할 수 없었다. 입력 중에는 하한을 적용하지 않는다.
    const payable = 64000
    const balance = 50000
    expect(clampPointsInput(2, payable, balance)).toBe(2)
    expect(clampPointsInput(25, payable, balance)).toBe(25)
    expect(clampPointsInput(250, payable, balance)).toBe(250)
    expect(clampPointsInput(2500, payable, balance)).toBe(2500)
    // 상한은 그대로 지킨다(서버가 422/50102로 거절하는 값은 애초에 못 넣는다).
    expect(clampPointsInput(999999, payable, 1200)).toBe(1200)
    expect(clampPointsInput(999999, 1100, balance)).toBe(1000)
    // 0 이하·비정상 입력은 0이다(입력창을 비우면 0).
    expect(clampPointsInput(-5, payable, balance)).toBe(0)
    expect(clampPointsInput(Number.NaN, payable, balance)).toBe(0)
  })
})

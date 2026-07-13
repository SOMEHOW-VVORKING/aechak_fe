import { describe, it, expect } from 'vitest'
import { clampPoints, finalPayable, maxUsablePoints, POINT_BALANCE } from '../checkout.mock'

describe('checkout.mock 적립금 계산', () => {
  it('[AC-CHECKOUT-001] 최대 사용 적립금은 min(보유, 결제금액)이다', () => {
    expect(maxUsablePoints(500)).toBe(500) // 결제금액이 보유보다 작으면 결제금액까지만
    expect(maxUsablePoints(64000)).toBe(POINT_BALANCE) // 보유(1,200) 한도
  })

  it('[AC-CHECKOUT-002] 입력 적립금은 [0, 최대]로 정규화된다', () => {
    expect(clampPoints(-100, 64000)).toBe(0)
    expect(clampPoints(999999, 64000)).toBe(POINT_BALANCE)
    expect(clampPoints(700, 64000)).toBe(700)
  })

  it('[AC-CHECKOUT-003] 전액사용(전액=최대)이 결제금액을 정확히 차감한다', () => {
    const itemsTotal = 64000
    const shipping = 0
    const points = maxUsablePoints(itemsTotal + shipping)
    expect(finalPayable(itemsTotal, shipping, points)).toBe(64000 - POINT_BALANCE)
  })

  it('[AC-CHECKOUT-004] 최종 결제금액 = 상품 + 배송비 − 적립금, 음수로 내려가지 않는다', () => {
    expect(finalPayable(13900, 3000, 1200)).toBe(15700)
    expect(finalPayable(1000, 0, 5000)).toBe(0)
  })
})

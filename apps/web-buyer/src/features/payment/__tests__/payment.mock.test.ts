import { describe, it, expect } from 'vitest'
import { generateOrderNo, processPayment, willPaymentFail } from '../payment.mock'

describe('payment.mock 결제 분기', () => {
  it('[AC-PAYMENT-001] 신용/체크카드는 실패, 간편결제는 성공한다(결정적 분기)', () => {
    expect(willPaymentFail('card')).toBe(true)
    expect(willPaymentFail('kakaopay')).toBe(false)
    expect(willPaymentFail('tosspay')).toBe(false)
  })

  it('[AC-PAYMENT-002] 카카오페이 결제는 넘긴 주문번호 그대로 성공 결과를 반환한다', async () => {
    const orderNo = generateOrderNo()
    const res = await processPayment({ amount: 59000, method: 'kakaopay', orderNo })
    expect(res.ok).toBe(true)
    expect(res.amount).toBe(59000)
    expect(res.orderNo).toBe(orderNo)
    expect(orderNo).toMatch(/^\d{8}-\d{4}$/)
    expect(res.failReason).toBeUndefined()
  })

  it('[AC-PAYMENT-003] 카드 결제는 실패 사유와 함께 실패 결과를 반환한다', async () => {
    const res = await processPayment({ amount: 59000, method: 'card', orderNo: generateOrderNo() })
    expect(res.ok).toBe(false)
    expect(res.failReason).toBeTruthy()
  })
})

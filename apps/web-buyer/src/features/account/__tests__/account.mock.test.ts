import { describe, it, expect } from 'vitest'
import type { BuyerOrder, BuyerOrderStatus } from '@aechak/domain'
import {
  NICKNAME_MAX,
  TEST_OTP_CODE,
  blockingBreakdown,
  getBlockingOrders,
  isValidOtp,
  isWithdrawBlocked,
  validateNickname,
} from '../account.mock'

// status만 보는 판정 함수 검증용 최소 주문 픽스처(나머지 필드는 판정에 무관).
function makeOrder(status: BuyerOrderStatus): BuyerOrder {
  return {
    id: `order-${status}`,
    orderedAt: '2026.07.10',
    status,
    method: 'kakaopay',
    groups: [],
    itemsTotal: 10000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 10000,
    pointsEarned: 100,
  }
}

describe('account.mock — 닉네임/OTP 검증', () => {
  it('[AC-ACCOUNT-001] 빈 닉네임은 검증 실패한다', () => {
    expect(validateNickname('   ').ok).toBe(false)
  })

  it('[AC-ACCOUNT-002] 최대 길이를 넘는 닉네임은 실패한다', () => {
    expect(validateNickname('가'.repeat(NICKNAME_MAX + 1)).ok).toBe(false)
  })

  it('[AC-ACCOUNT-003] 유효한 닉네임은 통과한다', () => {
    const result = validateNickname('코코집사')
    expect(result.ok).toBe(true)
    expect(result.message).toContain('사용할 수 있는')
  })

  it('[AC-ACCOUNT-009] 2자 미만 닉네임은 실패한다(실서버 정규식 2~12자)', () => {
    expect(validateNickname('코').ok).toBe(false)
    expect(validateNickname('a').ok).toBe(false)
  })

  it('[AC-ACCOUNT-010] 공백·이모지·자모가 섞이면 실패한다', () => {
    expect(validateNickname('코코 집사').ok).toBe(false) // 내부 공백
    expect(validateNickname('코코🐾').ok).toBe(false) // 이모지
    expect(validateNickname('ㄱㄴ').ok).toBe(false) // 완성형 아닌 자모
  })

  it('[AC-ACCOUNT-011] 영문·숫자 조합 2~12자는 통과한다', () => {
    expect(validateNickname('coco123').ok).toBe(true)
  })

  it('[AC-ACCOUNT-004] 고정 인증번호만 OTP 검증을 통과한다', () => {
    expect(isValidOtp(TEST_OTP_CODE)).toBe(true)
    expect(isValidOtp('123456')).toBe(false)
    expect(isValidOtp('')).toBe(false)
  })
})

describe('account.mock — 탈퇴 차단 판정', () => {
  it('[AC-ACCOUNT-005] 진행 중 주문(결제완료/준비중/배송중)이 있으면 탈퇴가 차단된다', () => {
    const orders = [makeOrder('paid'), makeOrder('delivered'), makeOrder('confirmed')]
    expect(isWithdrawBlocked(orders)).toBe(true)
    expect(getBlockingOrders(orders)).toHaveLength(1)
  })

  it('[AC-ACCOUNT-006] 완료/구매확정/취소완료만 있으면 탈퇴가 가능하다', () => {
    const orders = [makeOrder('delivered'), makeOrder('confirmed'), makeOrder('cancelled')]
    expect(isWithdrawBlocked(orders)).toBe(false)
    expect(getBlockingOrders(orders)).toHaveLength(0)
  })

  it('[AC-ACCOUNT-007] 차단 내역은 배송 준비 중/배송 중으로 나눠 집계한다', () => {
    const orders = [
      makeOrder('paid'),
      makeOrder('preparing'),
      makeOrder('shipping'),
      makeOrder('delivered'),
    ]
    const rows = blockingBreakdown(orders)
    expect(rows.find(r => r.label === '배송 준비 중 주문')?.count).toBe(2)
    expect(rows.find(r => r.label === '배송 중 주문')?.count).toBe(1)
  })

  it('[AC-ACCOUNT-008] 차단 주문이 없으면 내역 행도 비어 있다', () => {
    expect(blockingBreakdown([makeOrder('confirmed')])).toHaveLength(0)
  })
})

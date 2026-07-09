import { describe, it, expect } from 'vitest'
import { MOCK_SETTLEMENTS, mockFetchSettlements } from '../settlements.mock'

// AC-SETTLEMENTS-001: 정산 내역 조회는 시드 데이터를 그대로 반환한다
describe('mockFetchSettlements', () => {
  it('[AC-SETTLEMENTS-001] resolves with the seeded settlement list', async () => {
    await expect(mockFetchSettlements()).resolves.toEqual(MOCK_SETTLEMENTS)
  })
})

// AC-SETTLEMENTS-002: 건별 상세 분해가 있는 건은 세부 항목 합계가 feeAmount와 일치한다
describe('MOCK_SETTLEMENTS breakdown fields', () => {
  it('[AC-SETTLEMENTS-002] sums couponBurden + platformFeeAmount + pgFeeAmount + refundDeduction to feeAmount', () => {
    const withBreakdown = MOCK_SETTLEMENTS.filter(s => s.platformFeeAmount != null)
    expect(withBreakdown.length).toBeGreaterThan(0)

    for (const settlement of withBreakdown) {
      const sum =
        (settlement.couponBurden ?? 0) +
        (settlement.platformFeeAmount ?? 0) +
        (settlement.pgFeeAmount ?? 0) +
        (settlement.refundDeduction ?? 0)
      expect(sum).toBe(settlement.feeAmount)
    }
  })
})

// AC-SETTLEMENTS-003: 월 선택기가 제공하는 각 월(전체 제외)에 해당하는 정산 건이 최소 1건 존재한다
describe('MOCK_SETTLEMENTS month coverage', () => {
  it.each(['2026-06', '2026-05', '2026-04'])(
    '[AC-SETTLEMENTS-003] has at least one settlement for %s',
    month => {
      expect(MOCK_SETTLEMENTS.some(s => s.settlementMonth === month)).toBe(true)
    },
  )
})

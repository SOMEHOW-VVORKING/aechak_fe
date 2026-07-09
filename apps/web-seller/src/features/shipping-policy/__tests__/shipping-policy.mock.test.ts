import { describe, it, expect } from 'vitest'
import { MOCK_SHIPPING_POLICY, mockFetchShippingPolicy, mockUpdateShippingPolicy } from '../shipping-policy.mock'

// AC-SHIPPING-POLICY-001: 배송 정책을 조회하면 현재 저장된 값을 그대로 돌려준다
describe('mockFetchShippingPolicy', () => {
  it('[AC-SHIPPING-POLICY-001] returns the current stored policy', async () => {
    const policy = await mockFetchShippingPolicy()

    expect(policy).toEqual(MOCK_SHIPPING_POLICY)
  })
})

// AC-SHIPPING-POLICY-002: 배송 정책을 저장하면 변경된 값이 반영된다
describe('mockUpdateShippingPolicy', () => {
  it('[AC-SHIPPING-POLICY-002] persists updated fee values', async () => {
    const next = { ...MOCK_SHIPPING_POLICY, baseFee: 4500, defaultCourier: 'lotte' }

    const result = await mockUpdateShippingPolicy(next)

    expect(result.baseFee).toBe(4500)
    expect(result.defaultCourier).toBe('lotte')
    expect(MOCK_SHIPPING_POLICY.baseFee).toBe(4500)
  })
})

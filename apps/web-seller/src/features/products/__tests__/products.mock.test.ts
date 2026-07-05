import { describe, it, expect } from 'vitest'
import { MOCK_PRODUCTS, mockFetchProducts, mockRequestReinspection } from '../products.mock'

// AC-PRODUCTS-001: 상품 목록 조회는 시드 데이터를 그대로 반환한다
describe('mockFetchProducts', () => {
  it('[AC-PRODUCTS-001] resolves with the seeded product list', async () => {
    await expect(mockFetchProducts()).resolves.toEqual(MOCK_PRODUCTS)
  })
})

// AC-PRODUCTS-002: 재검수 요청 시 반려 상품의 검수 상태가 대기로 초기화된다
describe('mockRequestReinspection', () => {
  it('[AC-PRODUCTS-002] resets a rejected product back to pending inspection', async () => {
    const rejected = MOCK_PRODUCTS.find(p => p.inspectionStatus === 'rejected')
    expect(rejected).toBeDefined()

    await mockRequestReinspection({ productId: rejected!.id, note: '보완했습니다' })

    expect(rejected!.inspectionStatus).toBe('pending')
  })
})

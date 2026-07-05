import { describe, it, expect } from 'vitest'
import { MOCK_CLAIMS, mockApproveClaim, mockConfirmRefund } from '../claims.mock'

// AC-CLAIMS-001: 취소 클레임을 승인하면 상태가 승인 완료로 바뀐다
describe('mockApproveClaim', () => {
  it('[AC-CLAIMS-001] marks a cancel claim as approved', async () => {
    const claim = MOCK_CLAIMS.find(c => c.type === 'cancel' && c.status === 'pending')
    expect(claim).toBeDefined()

    await mockApproveClaim(claim!.id)

    expect(claim!.status).toBe('approved')
  })
})

// AC-CLAIMS-002: 수거중인 반품 건을 환불 확정하면 상태가 환불 완료로 바뀐다
describe('mockConfirmRefund', () => {
  it('[AC-CLAIMS-002] marks a collecting return claim as refunded', async () => {
    const claim = MOCK_CLAIMS.find(c => c.type === 'return' && c.status === 'collecting')
    expect(claim).toBeDefined()

    await mockConfirmRefund(claim!.id)

    expect(claim!.status).toBe('refunded')
  })
})

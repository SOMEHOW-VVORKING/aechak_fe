import { describe, it, expect } from 'vitest'
import { MOCK_SELLER_APPLICATION, mockFetchSellerApplication, mockResubmitApplication } from '../store-settings.mock'

// AC-STORE-SETTINGS-001: 신청서를 조회하면 현재 저장된 값을 그대로 돌려준다
describe('mockFetchSellerApplication', () => {
  it('[AC-STORE-SETTINGS-001] returns the current stored application', async () => {
    const application = await mockFetchSellerApplication()

    expect(application).toEqual(MOCK_SELLER_APPLICATION)
  })
})

// AC-STORE-SETTINGS-002: 재제출하면 상태가 resubmitted로 바뀌고 재제출 횟수가 증가한다
describe('mockResubmitApplication', () => {
  it('[AC-STORE-SETTINGS-002] transitions status to resubmitted and increments resubmissionCount', async () => {
    const payload = { ...MOCK_SELLER_APPLICATION, businessAddress: '서울 마포구 와우산로 1' }

    const result = await mockResubmitApplication(payload)

    expect(result.status).toBe('resubmitted')
    expect(result.resubmissionCount).toBe(1)
    expect(result.businessAddress).toBe('서울 마포구 와우산로 1')
    expect(MOCK_SELLER_APPLICATION.status).toBe('resubmitted')
  })
})

// AC-STORE-SETTINGS-003: status를 넘기면 해당 상태의 픽스처를 돌려준다 (화면의 상태별 분기 검증용)
describe('mockFetchSellerApplication with a status override', () => {
  it('[AC-STORE-SETTINGS-003] returns the approved fixture when status is approved', async () => {
    const application = await mockFetchSellerApplication('approved')

    expect(application.status).toBe('approved')
  })

  it('[AC-STORE-SETTINGS-004] returns the reviewing fixture without an active rejection reason', async () => {
    const application = await mockFetchSellerApplication('reviewing')

    expect(application.status).toBe('reviewing')
    expect(application.rejectionReason).toBeUndefined()
  })

  it('[AC-STORE-SETTINGS-005] returns the pending fixture with all documents already submitted', async () => {
    const application = await mockFetchSellerApplication('pending')

    expect(application.status).toBe('pending')
    expect(application.documents.some(doc => doc.status === 'resubmission-required')).toBe(false)
  })
})

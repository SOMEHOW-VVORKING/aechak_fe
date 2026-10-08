import { describe, it, expect } from 'vitest'
import { SubmitInquiryRequestInquiryType } from '@aechak/api'
import { INQUIRY_TYPE_OPTIONS } from '../inquiry.mock'

describe('inquiry.mock', () => {
  it('[AC-INQUIRY-001] 문의 유형은 서버 enum 5종과 목업 순서대로 1:1 매핑된다', () => {
    expect(INQUIRY_TYPE_OPTIONS).toHaveLength(5)
    expect(INQUIRY_TYPE_OPTIONS.map(o => o.value)).toEqual([
      SubmitInquiryRequestInquiryType.ACCOUNT,
      SubmitInquiryRequestInquiryType.ORDER_PAYMENT,
      SubmitInquiryRequestInquiryType.DELIVERY_CLAIM,
      SubmitInquiryRequestInquiryType.SELLER_PRODUCT,
      SubmitInquiryRequestInquiryType.SERVICE_ETC,
    ])
    // 라벨 구분자는 가운뎃점이 아니라 `/`(카피 컨벤션).
    expect(INQUIRY_TYPE_OPTIONS.every(o => !o.label.includes('·'))).toBe(true)
  })
})

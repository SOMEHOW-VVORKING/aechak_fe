import { describe, it, expect } from 'vitest'
import { SubmitInquiryRequestInquiryType } from '@aechak/api'
import {
  INQUIRY_TYPE_OPTIONS,
  MAX_INQUIRY_CONTENT_LENGTH,
  isValidEmail,
  isValidInquiry,
} from '../inquiry.mock'

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

  it('[AC-INQUIRY-002] isValidEmail은 형식이 맞을 때만 통과한다', () => {
    expect(isValidEmail('kongi.mom@aechak.co.kr')).toBe(true)
    expect(isValidEmail('  name@aechak.co.kr  ')).toBe(true) // 앞뒤 공백 트림
    expect(isValidEmail('kongi.mom@')).toBe(false) // 목업 3-C 케이스
    expect(isValidEmail('kongi.mom')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('[AC-INQUIRY-003] isValidInquiry는 유형+이메일+내용이 모두 갖춰져야 통과한다', () => {
    const base = {
      type: SubmitInquiryRequestInquiryType.ORDER_PAYMENT,
      email: 'kongi.mom@aechak.co.kr',
      content: '결제는 완료됐는데 주문 내역에 안 보여요.',
    }
    expect(isValidInquiry(base)).toBe(true)
    expect(isValidInquiry({ ...base, type: '' })).toBe(false) // 유형 미선택
    expect(isValidInquiry({ ...base, email: 'kongi.mom@' })).toBe(false) // 이메일 형식
    expect(isValidInquiry({ ...base, content: '   ' })).toBe(false) // 내용 공백만
  })

  it('[AC-INQUIRY-004] 내용 상한은 BE 계약(2000자)이고 초과 시 통과하지 않는다', () => {
    expect(MAX_INQUIRY_CONTENT_LENGTH).toBe(2000)
    const base = { type: SubmitInquiryRequestInquiryType.SERVICE_ETC, email: 'a@b.com' }
    expect(isValidInquiry({ ...base, content: 'x'.repeat(2000) })).toBe(true)
    expect(isValidInquiry({ ...base, content: 'x'.repeat(2001) })).toBe(false)
  })
})

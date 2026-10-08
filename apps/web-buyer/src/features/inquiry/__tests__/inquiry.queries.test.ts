import { describe, it, expect } from 'vitest'
import { inquiryErrorMessage } from '../inquiry.queries'

// axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체.
const err = (errorCode: number, message = '') => ({
  isAxiosError: true,
  response: { status: 400, data: { errorCode, message } },
})

// 입력 상한(AC-INQUIRY-004)은 maxlength 속성이 실제로 걸렸는지 route 테스트가 확인한다.
describe('inquiry.queries', () => {
  it('[AC-INQUIRY-ERR-001] 90001은 서버 message와 상관없이 한 문장으로 안내한다', () => {
    const generic = '입력한 내용을 다시 확인해주세요'
    expect(inquiryErrorMessage(err(90001, '이메일 형식이 올바르지 않습니다.'))).toBe(generic)
    expect(inquiryErrorMessage(err(90001, '문의 내용은 2000자를 넘을 수 없습니다.'))).toBe(generic)
    expect(inquiryErrorMessage(err(90001))).toBe(generic)
  })

  it('[AC-INQUIRY-ERR-002] 도메인 코드 120000~120004는 코드별 문구로 안내한다', () => {
    expect(inquiryErrorMessage(err(120000))).toBe('문의 내용을 입력해주세요')
    expect(inquiryErrorMessage(err(120001))).toBe('문의 내용은 2000자까지 쓸 수 있어요')
    expect(inquiryErrorMessage(err(120002))).toBe('답변 받을 이메일을 입력해주세요')
    expect(inquiryErrorMessage(err(120003))).toBe('이메일은 255자까지 쓸 수 있어요')
    expect(inquiryErrorMessage(err(120004))).toBe('이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr')
    expect(inquiryErrorMessage(new Error('network'))).toBe('요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요')
  })
})

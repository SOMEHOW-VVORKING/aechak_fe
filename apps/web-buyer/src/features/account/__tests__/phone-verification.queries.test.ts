import { describe, it, expect } from 'vitest'
import { phoneVerificationErrorMessage } from '../account.queries'

// axios 에러 모양(response.data.errorCode)만 흉내 낸 최소 객체.
function axiosLikeError(status: number, errorCode: number, message = '서버 문구') {
  return { response: { status, data: { errorCode, message } } }
}

describe('phoneVerificationErrorMessage — SMS 에러코드 매핑', () => {
  it('[AC-VERIFY-ERR-001] 30005(불일치)는 재입력을 유도한다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 30005))).toBe(
      '인증번호가 올바르지 않아요.',
    )
  })

  it('[AC-VERIFY-ERR-002] 30009(만료)/30010(횟수 초과)은 재전송을 유도한다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 30009))).toContain('재전송')
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30010))).toContain('재전송')
  })

  it('[AC-VERIFY-ERR-003] 30006(쿨다운)과 30008(일 상한)은 다른 안내를 준다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30006))).toContain('잠시 후')
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30008))).toContain('내일')
  })

  it('[AC-VERIFY-ERR-004] 30007(발송 실패)·90001(형식)도 개별 문구를 가진다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(502, 30007))).toContain('발송에 실패')
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 90001))).toContain('형식')
  })

  it('[AC-VERIFY-ERR-005] 모르는 코드는 서버 message를 그대로, 그것도 없으면 공통 문구를 쓴다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(500, 90000, '서버 오류입니다.'))).toBe(
      '서버 오류입니다.',
    )
    expect(phoneVerificationErrorMessage(new Error('network'))).toContain('잠시 후 다시 시도')
  })
})

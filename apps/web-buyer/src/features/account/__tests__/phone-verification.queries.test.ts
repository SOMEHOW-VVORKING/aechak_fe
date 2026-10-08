import { describe, it, expect } from 'vitest'
import { phoneVerificationErrorMessage } from '../account.queries'

// axios 에러 모양(isAxiosError 플래그 + response.data.errorCode)만 흉내 낸 최소 객체.
function axiosLikeError(status: number, errorCode: number, message = '서버 문구') {
  return { isAxiosError: true, response: { status, data: { errorCode, message } } }
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
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 90001))).toContain('휴대폰 번호 형식')
  })

  it('[AC-VERIFY-ERR-006] 확인 단계의 90001은 번호가 아니라 인증번호 형식을 안내한다', () => {
    // 번호는 발송 때 이미 서버 @Pattern을 통과했으므로 confirm의 @Valid 실패는 code(6자리 숫자)뿐이다.
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 90001), 'confirm')).toBe(
      '인증번호 6자리 숫자를 입력해 주세요.',
    )
  })

  it('[AC-VERIFY-ERR-005] 모르는 코드·응답 없는 오류는 서버 message(-습니다체) 대신 공통 해요체 문구를 쓴다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(500, 90000, '서버 오류입니다.'))).toContain(
      '잠시 후 다시 시도',
    )
    expect(phoneVerificationErrorMessage(new Error('network'))).toContain('잠시 후 다시 시도')
  })
})

import { describe, it, expect } from 'vitest'
import { PHONE_CODE_LENGTH, phoneVerificationErrorMessage } from '../phone-verification.contract'

// axios 에러 모양(isAxiosError 플래그 + response.data.errorCode)만 흉내 낸 최소 객체.
function axiosLikeError(status: number, errorCode: number, message = '서버 문구') {
  return { isAxiosError: true, response: { status, data: { errorCode, message } } }
}

// BE UserErrorCode 30005~30010 미러. 사용자가 취해야 할 조치가 코드마다 달라 문구를 가른다.
describe('phone-verification.contract — SMS 에러코드 문구', () => {
  it('[AC-SELLER-VERIFY-001] 30005(불일치)는 재입력을 유도한다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 30005), 'confirm')).toBe(
      '인증번호가 올바르지 않아요.',
    )
  })

  it('[AC-SELLER-VERIFY-002] 30009(만료)·30010(횟수 초과)은 재발송으로만 풀리므로 그쪽을 가리킨다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 30009), 'confirm')).toContain('다시 받아')
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30010), 'confirm')).toContain('다시 받아')
  })

  it('[AC-SELLER-VERIFY-003] 30006(쿨다운)·30008(일 상한)·30007(발송 실패)은 서로 다른 안내다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30006))).toContain('잠시 후')
    expect(phoneVerificationErrorMessage(axiosLikeError(429, 30008))).toContain('내일')
    expect(phoneVerificationErrorMessage(axiosLikeError(502, 30007))).toContain('발송에 실패')
  })

  it('[AC-SELLER-VERIFY-004] 90001은 단계마다 뜻이 다르다 — 발송은 번호 형식, 확인은 인증번호 형식', () => {
    // 번호는 발송 때 이미 서버 @Pattern을 통과했으므로 confirm의 @Valid 실패는 code뿐이다.
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 90001))).toContain('휴대폰 번호 형식')
    expect(phoneVerificationErrorMessage(axiosLikeError(400, 90001), 'confirm')).toBe(
      `인증번호 ${PHONE_CODE_LENGTH}자리 숫자를 입력해 주세요.`,
    )
  })

  it('[AC-SELLER-VERIFY-005] 모르는 코드·응답 없는 오류는 서버 격식체 문구를 쓰지 않는다', () => {
    expect(phoneVerificationErrorMessage(axiosLikeError(500, 90000, '서버 오류입니다.'))).toBe(
      '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
    expect(phoneVerificationErrorMessage(new Error('network'))).toContain('잠시 후 다시 시도')
  })
})

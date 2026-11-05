import { errorResponse } from '@aechak/api'

// 입점 신청 화면의 휴대폰 본인 인증(POST /users/me/phone/verifications · /confirm) 에러 문구.
// 와이어 매핑을 feature 안에 가두는 관례를 따른다 — 훅은 phone-verification.queries.ts.
// 앱 간 코드 공유를 쓰지 않는 레포라 구매자 account.queries.ts와 같은 모양을 셀러 쪽에 따로 둔다.

/** 서버 @Pattern(^\d{6}$)과 같은 자릿수 — maxLength·placeholder가 이 값을 쓴다. */
export const PHONE_CODE_LENGTH = 6

// BE UserErrorCode 30005~30010.
const SMS_CODE_INVALID = 30005
const SMS_RESEND_COOLDOWN = 30006
const SMS_SEND_FAILED = 30007
const SMS_DAILY_LIMIT_EXCEEDED = 30008
const SMS_CODE_EXPIRED = 30009
const SMS_ATTEMPTS_EXCEEDED = 30010
const INVALID_REQUEST = 90001

/**
 * 인증 에러 문구. 30009(만료)·30010(횟수 초과)은 재발송으로만 풀리므로 문구가 재발송을 가리킨다.
 * 90001(@Valid 실패)은 단계마다 뜻이 다르다 — 발송은 번호 형식, 확인은 발송 때 번호가 이미
 * 통과했으니 인증번호 형식이다. 서버 message는 -습니다체라 쓰지 않는다.
 */
export function phoneVerificationErrorMessage(error: unknown, step: 'send' | 'confirm' = 'send'): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case SMS_CODE_INVALID:
      return '인증번호가 올바르지 않아요.'
    case SMS_RESEND_COOLDOWN:
      return '재발송은 잠시 후에 가능해요.'
    case SMS_SEND_FAILED:
      return '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.'
    case SMS_DAILY_LIMIT_EXCEEDED:
      return '오늘 발송 가능 횟수를 모두 사용했어요. 내일 다시 시도해 주세요.'
    case SMS_CODE_EXPIRED:
      return '인증번호가 만료됐어요. 다시 받아 주세요.'
    case SMS_ATTEMPTS_EXCEEDED:
      return '입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요.'
    case INVALID_REQUEST:
      return step === 'confirm'
        ? `인증번호 ${PHONE_CODE_LENGTH}자리 숫자를 입력해 주세요.`
        : '휴대폰 번호 형식을 확인해 주세요.'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

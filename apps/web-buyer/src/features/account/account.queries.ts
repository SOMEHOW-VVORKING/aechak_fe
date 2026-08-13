import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  confirmPhoneCode,
  sendPhoneCode,
  type ConfirmPhoneCodeRequest,
  type PhoneCodeSent,
} from '@aechak/api'
import { ACCOUNT_QUERY_KEY } from '@/shared/account'

// 휴대폰 본인 인증(b10-st-9)을 실서버(POST /users/me/phone/verifications · /confirm)에 붙이는
// 얇은 어댑터. breeds 컨벤션대로 생성된 react-query 훅이 아니라 fetcher만 소비하고, 이 파일이
// 자체 useMutation으로 감싼다. 탈퇴(useWithdraw)만 BE 미구현이라 setTimeout 목업으로 남는다.

// 서버 에러코드(SMS 세분화 — BE UserErrorCode 30005~30010).
const SMS_CODE_INVALID = 30005
const SMS_RESEND_COOLDOWN = 30006
const SMS_SEND_FAILED = 30007
const SMS_DAILY_LIMIT_EXCEEDED = 30008
const SMS_CODE_EXPIRED = 30009
const SMS_ATTEMPTS_EXCEEDED = 30010
const INVALID_REQUEST = 90001

interface MutateOptions<T = void> {
  onSuccess?: (result: T) => void
  onError?: (error: unknown) => void
}

/**
 * 인증번호 발송(재발송 = 재호출). 응답의 expiresInSeconds/resendCooldownSeconds가
 * 화면 타이머의 원천이다 — 수치를 하드코딩하지 말 것(서버 계약).
 */
export function useSendPhoneCode() {
  const mutation = useMutation({
    mutationFn: (phoneNumber: string) => sendPhoneCode({ phoneNumber }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (phoneNumber: string, opts?: MutateOptions<PhoneCodeSent>) =>
      mutation.mutate(phoneNumber, {
        onSuccess: response => opts?.onSuccess?.(response.data),
        onError: opts?.onError,
      }),
  }
}

/**
 * 인증번호 확인. 성공 응답이 변경 후 내 정보(UserMe — 마스킹 번호·isPhoneVerified=true)라
 * 재조회 없이 계정 캐시(ACCOUNT_QUERY_KEY)에 바로 반영한다 — 마이 허브 배지·프로필 수정
 * 화면이 같은 캐시를 읽으므로 인증 완료가 즉시 전파된다.
 */
export function useConfirmPhoneCode() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body: ConfirmPhoneCodeRequest) => confirmPhoneCode(body),
    onSuccess: response => {
      queryClient.setQueryData(ACCOUNT_QUERY_KEY, response)
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (body: ConfirmPhoneCodeRequest, opts?: MutateOptions) =>
      mutation.mutate(body, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: opts?.onError,
      }),
  }
}

// 인증 에러는 errorCode로 분기한다 — 30009(만료)/30010(횟수 초과)은 재발송으로만 복구되므로
// 문구가 재전송을 유도해야 한다. axios 타입을 안 끌어오려고 duck-typing.
export function phoneVerificationErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { errorCode?: number; message?: string } } })
    ?.response?.data
  switch (data?.errorCode) {
    case SMS_CODE_INVALID:
      return '인증번호가 올바르지 않아요.'
    case SMS_RESEND_COOLDOWN:
      return '재발송은 잠시 후에 가능해요.'
    case SMS_SEND_FAILED:
      return '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.'
    case SMS_DAILY_LIMIT_EXCEEDED:
      return '오늘 발송 가능 횟수를 모두 사용했어요. 내일 다시 시도해 주세요.'
    case SMS_CODE_EXPIRED:
      return '인증번호가 만료됐어요. 재전송해 주세요.'
    case SMS_ATTEMPTS_EXCEEDED:
      return '입력 횟수를 초과했어요. 인증번호를 재전송해 주세요.'
    case INVALID_REQUEST:
      return '휴대폰 번호 형식을 확인해 주세요.'
    default:
      return data?.message ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

/** 회원 탈퇴 처리(b10-st-5). 되돌릴 수 없는 목업 종결 액션 — 확인 Modal 버튼 로딩용(BE 미구현). */
export function useWithdraw() {
  return useMutation<void, Error, void>({
    mutationFn: () => new Promise(resolve => setTimeout(resolve, 600)),
  })
}

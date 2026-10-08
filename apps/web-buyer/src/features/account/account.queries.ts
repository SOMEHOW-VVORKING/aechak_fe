import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  checkWithdrawal,
  confirmPhoneCode,
  errorResponse,
  sendPhoneCode,
  setAccessToken,
  withdraw,
  type ConfirmPhoneCodeRequest,
  type PhoneCodeSent,
} from '@aechak/api'
import { ACCOUNT_QUERY_KEY } from '@/shared/account'
import { logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { resetReviews } from '@/shared/review'

// 휴대폰 본인 인증(b10-st-9)을 실서버(POST /users/me/phone/verifications · /confirm)에 붙이는
// 얇은 어댑터. breeds 컨벤션대로 생성된 react-query 훅이 아니라 fetcher만 소비하고, 이 파일이
// 자체 useMutation으로 감싼다. 탈퇴(GET /users/me/withdrawal/check · DELETE /users/me)도 같은 방식이다.

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
// 문구가 재전송을 유도해야 한다. 90001(@Valid 실패)은 단계마다 뜻이 다르다 — 발송은 번호 형식이고,
// 확인은 번호가 발송 때 이미 통과했으니 인증번호 형식(6자리 숫자)이다. 서버 message는 -습니다체라 쓰지 않는다.
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
      return '인증번호가 만료됐어요. 재전송해 주세요.'
    case SMS_ATTEMPTS_EXCEEDED:
      return '입력 횟수를 초과했어요. 인증번호를 재전송해 주세요.'
    case INVALID_REQUEST:
      return step === 'confirm'
        ? '인증번호 6자리 숫자를 입력해 주세요.'
        : '휴대폰 번호 형식을 확인해 주세요.'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

// 탈퇴 에러코드(BE UserErrorCode 30003/30011, AuthErrorCode 20005).
const ALREADY_WITHDRAWN = 30003
const WITHDRAWAL_BLOCKED = 30011
const ACCOUNT_BLOCKED = 20005

export const WITHDRAWAL_CHECK_QUERY_KEY = ['account', 'withdrawal-check'] as const

/** 탈퇴 가능 여부(b10-st-5). 서버는 사유 목록 없이 withdrawable만 준다. */
export function useWithdrawalCheck() {
  return useQuery({
    queryKey: WITHDRAWAL_CHECK_QUERY_KEY,
    queryFn: ({ signal }) => checkWithdrawal(signal).then(response => response.data),
  })
}

/**
 * 회원 탈퇴(DELETE /users/me, 204). 서버가 세션을 폐기하고 refresh 쿠키를 만료하므로 성공 시
 * access 토큰을 버리고 설정 홈 로그아웃과 같은 순서로 클라이언트 상태를 정리한다. 정리를 호출부
 * mutate 콜백이 아니라 여기 두는 이유는 응답 전에 화면을 떠나면 호출부 콜백은 실행되지 않기 때문이다.
 */
export function useWithdraw() {
  const queryClient = useQueryClient()
  return useMutation<void, unknown, void>({
    mutationFn: withdraw,
    onSuccess: () => {
      setAccessToken(null)
      logout()
      onWishlistLogout(queryClient)
      resetReviews()
      queryClient.clear()
    },
  })
}

export function isWithdrawalBlockedError(error: unknown): boolean {
  return errorResponse(error)?.data?.errorCode === WITHDRAWAL_BLOCKED
}

export function withdrawErrorMessage(
  error: unknown,
  fallback = '탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case WITHDRAWAL_BLOCKED:
      return '정리되지 않은 거래가 있어 탈퇴할 수 없어요.'
    case ALREADY_WITHDRAWN:
      return '이미 탈퇴한 계정이에요.'
    case ACCOUNT_BLOCKED:
      return '이용이 제한된 계정이라 탈퇴할 수 없어요.'
    default:
      return fallback
  }
}

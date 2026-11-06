import { useMutation } from '@tanstack/react-query'
import { confirmPhoneCode, sendPhoneCode, type ConfirmPhoneCodeRequest } from '@aechak/api'

// 휴대폰 점유 인증을 실서버(POST /users/me/phone/verifications · /confirm)에 붙이는 얇은 어댑터.
// 생성된 react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useMutation으로 감싼다.
// 두 경로는 호스트 분기 프리픽스(/sellers·/seller-applications·/admin)에 걸리지 않아 api 호스트로 나간다 —
// 인증 여부는 계정 속성이라 어느 앱에서 인증해도 같은 계정에 기록된다.

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

/** 인증번호 발송(재발송 = 재호출). 쿨다운·일 상한은 서버가 429로 판정하고 화면은 그 문구만 보여준다. */
export function useSendPhoneCode() {
  const mutation = useMutation({
    mutationFn: (phoneNumber: string) => sendPhoneCode({ phoneNumber }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (phoneNumber: string, opts?: MutateOptions) =>
      mutation.mutate(phoneNumber, { onSuccess: () => opts?.onSuccess?.(), onError: opts?.onError }),
  }
}

/**
 * 인증번호 확인. 성공 응답은 변경 후 내 정보(isPhoneVerified=true)지만 셀러 앱에는 계정 캐시가
 * 없고 이 화면이 인증 여부를 조회해 분기하지도 않으므로 응답을 쓰지 않는다 — 저장/제출의
 * 선행 조건 판정은 BE(403/10103)가 한다.
 */
export function useConfirmPhoneCode() {
  const mutation = useMutation({
    mutationFn: (body: ConfirmPhoneCodeRequest) => confirmPhoneCode(body),
  })
  return {
    isPending: mutation.isPending,
    mutate: (body: ConfirmPhoneCodeRequest, opts?: MutateOptions) =>
      mutation.mutate(body, { onSuccess: () => opts?.onSuccess?.(), onError: opts?.onError }),
  }
}

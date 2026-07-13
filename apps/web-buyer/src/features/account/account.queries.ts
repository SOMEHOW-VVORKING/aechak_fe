import { useMutation } from '@tanstack/react-query'
import { updateProfile, verifyPhone, type ProfilePatch } from '@/shared/account'

// 계정 상태 전이는 shared/account 스토어가 단일 소스다 — 저장/인증 같은 전이를 useMutation으로
// 감싸 버튼 로딩(isPending)을 준다(찜/주문/리뷰의 mutation 관례와 동일한 setTimeout 목업).

/** 프로필 저장(b10-st-2). 저장 버튼 로딩 + 성공 토스트용. */
export function useUpdateProfile() {
  return useMutation<void, Error, ProfilePatch>({
    mutationFn: patch =>
      new Promise(resolve => {
        setTimeout(() => {
          updateProfile(patch)
          resolve()
        }, 500)
      }),
  })
}

/** 인증번호 발송(b10-st-9). 실제 SMS 대신 지연만 준다 — 발송/재전송 버튼 로딩용. */
export function useSendOtp() {
  return useMutation<void, Error, string>({
    mutationFn: () => new Promise(resolve => setTimeout(resolve, 400)),
  })
}

/** 휴대폰 본인 인증 완료(b10-st-9). 인증 버튼 로딩 + 인증완료 전이. */
export function useVerifyPhone() {
  return useMutation<void, Error, string>({
    mutationFn: phone =>
      new Promise(resolve => {
        setTimeout(() => {
          verifyPhone(phone)
          resolve()
        }, 500)
      }),
  })
}

/** 회원 탈퇴 처리(b10-st-5). 되돌릴 수 없는 목업 종결 액션 — 확인 Modal 버튼 로딩용. */
export function useWithdraw() {
  return useMutation<void, Error, void>({
    mutationFn: () => new Promise(resolve => setTimeout(resolve, 600)),
  })
}

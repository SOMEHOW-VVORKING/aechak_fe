import { useMutation } from '@tanstack/react-query'
import {
  submitInquiry,
  type SubmitInquiryRequest,
  type SubmitInquiryRequestInquiryType,
} from '@aechak/api'

// 고객센터 문의(b6-st-3)를 실제 백엔드에 붙이는 얇은 어댑터.
// 생성된 react-query 훅이 아니라 fetcher(submitInquiry)만 소비한다(AGENTS.md breeds/배송지 절 컨벤션) —
// packages/api와 앱의 react-query 선언 범위가 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시
// 깨질 수 있다. 이 파일이 자체 useMutation으로 감싼다. 문의는 fire-and-forget이라 store/캐시 없음.

export interface SubmitInquiryInput {
  inquiryType: SubmitInquiryRequestInquiryType
  replyEmail: string
  content: string
}

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export function useSubmitInquiry() {
  const mutation = useMutation({
    mutationFn: (input: SubmitInquiryInput) =>
      submitInquiry({
        inquiryType: input.inquiryType,
        replyEmail: input.replyEmail.trim(),
        content: input.content.trim(),
      } satisfies SubmitInquiryRequest),
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: SubmitInquiryInput, opts?: MutateOptions) => mutation.mutate(input, opts),
  }
}

// 비401 에러 문구는 HTTP status로 고른다(401은 axios 인터셉터 refresh + 전역 리다이렉트가 처리하므로
// 여기 오지 않는다). axios 타입을 안 끌어오려고 duck-typing.
export function inquiryErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message
  switch (status) {
    case 400:
      return serverMessage ?? '입력한 내용을 다시 확인해주세요'
    default:
      return serverMessage ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}

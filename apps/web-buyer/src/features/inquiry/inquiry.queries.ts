import { useMutation } from '@tanstack/react-query'
import { errorResponse, submitInquiry, type SubmitInquiryRequestInquiryType } from '@aechak/api'

// 고객센터 문의(b6-st-3)를 실제 백엔드에 붙이는 얇은 어댑터.
// 생성된 react-query 훅이 아니라 fetcher(submitInquiry)만 소비한다(AGENTS.md breeds/배송지 절 컨벤션) —
// packages/api와 앱의 react-query 선언 범위가 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시
// 깨질 수 있다. 이 파일이 자체 useMutation으로 감싼다. 문의는 fire-and-forget이라 store/캐시 없음.

// 입력 제약은 BE 계약을 그대로 옮긴다(be origin/develop 기준). 화면은 이 값을 네이티브 속성(maxLength)으로 쓴다.
/** domain/.../inquiry/inquiry/Inquiry.kt:54 MAX_CONTENT_LENGTH, boot/api/.../inquiry/request/SubmitInquiryRequest.kt:22 @Size */
export const MAX_INQUIRY_CONTENT_LENGTH = 2000
/** boot/api/.../inquiry/request/SubmitInquiryRequest.kt:19 @Size(max = 255), Inquiry.kt:55 MAX_REPLY_EMAIL_LENGTH */
export const MAX_REPLY_EMAIL_LENGTH = 255
/**
 * domain/.../inquiry/inquiry/Inquiry.kt:57 REPLY_EMAIL_REGEX에서 앞뒤 고정(^…$)만 뺀 값(도메인에 점 필수, 어기면 120004).
 * type=email은 name@gmail처럼 점 없는 도메인도 통과시켜서 pattern 속성으로 함께 건다. 브라우저가 ^(?:…)$로 감싼다.
 */
export const REPLY_EMAIL_PATTERN = String.raw`[^@\s]+@[^@\s]+\.[^@\s]+`

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
    mutationFn: (input: SubmitInquiryInput) => submitInquiry(input),
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: SubmitInquiryInput, opts?: MutateOptions) => mutation.mutate(input, opts),
  }
}

// 화면 인라인 안내와 서버 도메인 코드 안내가 같은 문구를 쓴다.
export const CONTENT_REQUIRED = '문의 내용을 입력해주세요'
const CONTENT_TOO_LONG = `문의 내용은 ${MAX_INQUIRY_CONTENT_LENGTH}자까지 쓸 수 있어요`
export const EMAIL_REQUIRED = '답변 받을 이메일을 입력해주세요'
const EMAIL_TOO_LONG = `이메일은 ${MAX_REPLY_EMAIL_LENGTH}자까지 쓸 수 있어요`
export const EMAIL_INVALID = '이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'

// 서버 에러코드(BE InquiryErrorCode 120000~120004, @Valid 실패는 90001)로 분기한다. 401은 axios 인터셉터
// refresh + 전역 리다이렉트가 처리하므로 여기 오지 않는다. 서버 message는 -습니다체이고 계약도 아니라 읽지 않는다 —
// 90001은 화면 검증을 통과한 뒤에만 오므로 한 문장으로 안내한다.
export function inquiryErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 120000:
      return CONTENT_REQUIRED
    case 120001:
      return CONTENT_TOO_LONG
    case 120002:
      return EMAIL_REQUIRED
    case 120003:
      return EMAIL_TOO_LONG
    case 120004:
      return EMAIL_INVALID
    case 90001:
      return '입력한 내용을 다시 확인해주세요'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}

import { CreditCard, HelpCircle, Store, Truck, UserRound, type LucideIcon } from 'lucide-react'
import { SubmitInquiryRequestInquiryType } from '@aechak/api'

// 고객센터 문의(b6-st-3) 유형 5종. 값은 orval이 생성한 서버 enum을 그대로 쓰고(도메인 타입을
// 새로 만들지 않는다 — 서버 enum이 feature 밖으로 새지 않게 여기 가둔다), 라벨/아이콘만 목업
// 3-B 시트와 1:1로 맞춘다. 라벨 구분자는 목업 그대로 `/`(카피 컨벤션 — 가운뎃점 금지).
export const INQUIRY_TYPE_OPTIONS: {
  value: SubmitInquiryRequestInquiryType
  label: string
  icon: LucideIcon
}[] = [
  { value: SubmitInquiryRequestInquiryType.ACCOUNT, label: '계정 / 로그인', icon: UserRound },
  { value: SubmitInquiryRequestInquiryType.ORDER_PAYMENT, label: '주문 / 결제', icon: CreditCard },
  { value: SubmitInquiryRequestInquiryType.DELIVERY_CLAIM, label: '배송 / 반품 / 교환', icon: Truck },
  { value: SubmitInquiryRequestInquiryType.SELLER_PRODUCT, label: '셀러 / 상품', icon: Store },
  { value: SubmitInquiryRequestInquiryType.SERVICE_ETC, label: '서비스 이용 / 기타', icon: HelpCircle },
]

// 내용 상한은 BE 계약(2000자)에 맞춘다 — 목업 카운터(/1000)가 아니라 서버가 실제 허용하는 값.
export const MAX_INQUIRY_CONTENT_LENGTH = 2000

// 이메일 형식 검증 — 공백 없는 local@domain.tld. 서버가 최종 판정하므로 과하게 엄격히 하지 않는다.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}

export interface InquiryDraft {
  type: SubmitInquiryRequestInquiryType | ''
  email: string
  content: string
}

export type ValidInquiryDraft = InquiryDraft & { type: SubmitInquiryRequestInquiryType }

// 제출 유효성 — 유형 선택 + 이메일 형식 + 내용 non-empty + 상한 이하. 셋 다 필수(목업/BE 계약).
export function isValidInquiry(draft: InquiryDraft): draft is ValidInquiryDraft {
  return (
    INQUIRY_TYPE_OPTIONS.some(o => o.value === draft.type) &&
    isValidEmail(draft.email) &&
    draft.content.trim().length > 0 &&
    draft.content.length <= MAX_INQUIRY_CONTENT_LENGTH
  )
}

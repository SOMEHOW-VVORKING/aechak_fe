import type { StatusPillVariant } from '@aechak/design-system/web'
import type { ProductInquiryCategory, ProductInquiryStatus } from '@aechak/api'

// 구매자 쪽 문의 어휘. 셀러센터(web-seller)와 같은 값을 쓰지만 앱이 달라 모듈을 공유할 수 없어
// 여기 한 번 더 둔다 — 라벨 문구는 두 화면이 어긋나면 안 되므로 바꿀 때 양쪽을 함께 본다.

/** 서버 상태 어휘는 '접수'(RECEIVED)이고 화면 라벨은 '답변 대기'다. */
export const INQUIRY_STATUS_LABEL: Record<ProductInquiryStatus, string> = {
  RECEIVED: '답변 대기',
  ANSWERED: '답변 완료',
  WITHDRAWN: '철회함',
}

export const INQUIRY_STATUS_VARIANT: Record<ProductInquiryStatus, StatusPillVariant> = {
  RECEIVED: 'warning',
  ANSWERED: 'success',
  WITHDRAWN: 'muted',
}

export const INQUIRY_CATEGORY_LABEL: Record<ProductInquiryCategory, string> = {
  PRODUCT: '상품',
  DELIVERY: '배송',
  CLAIM: '취소/반품/교환',
  ETC: '기타',
}

/** 등록 화면의 유형 선택 항목. enum 순서를 그대로 따른다. */
export const INQUIRY_CATEGORY_OPTIONS: readonly { value: ProductInquiryCategory; label: string }[] =
  [
    { value: 'PRODUCT', label: INQUIRY_CATEGORY_LABEL.PRODUCT },
    { value: 'DELIVERY', label: INQUIRY_CATEGORY_LABEL.DELIVERY },
    { value: 'CLAIM', label: INQUIRY_CATEGORY_LABEL.CLAIM },
    { value: 'ETC', label: INQUIRY_CATEGORY_LABEL.ETC },
  ]

/** BE 도메인 상한(ProductInquiry.TITLE_MAX / CONTENT_MAX)과 같은 값. */
export const INQUIRY_TITLE_MAX = 100
export const INQUIRY_CONTENT_MAX = 1000

/**
 * `2026-10-26T09:14:00` → `2026.10.26`. 서버가 오프셋 없는 벽시계를 내려주므로 Date로 파싱하지
 * 않고 문자열을 자른다(타임존 보정이 끼면 날짜가 하루 밀린다).
 */
export function inquiryDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '.')
}

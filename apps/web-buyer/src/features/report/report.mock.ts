import type { ProductReportReason } from '@aechak/domain'
import { findProduct } from '@/shared/catalog'

// 상품 신고(b8-st-1-product) 사유 5종. 목업 라디오 순서·문구와 1:1로 맞춘다.
export const PRODUCT_REPORT_REASONS: { value: ProductReportReason; label: string }[] = [
  { value: 'false-ad', label: '허위/과장 광고' },
  { value: 'wrong-info', label: '상품 정보 오류' },
  { value: 'illegal', label: '불법 및 미취급 상품' },
  { value: 'inappropriate', label: '부적절한 내용' },
  { value: 'etc', label: '기타' },
]

export const MAX_REPORT_DETAIL_LENGTH = 300

// 신고 제출 유효성 — 사유는 반드시 선택해야 하고, 상세 내용은 선택 입력이다.
// (목업이 상세를 "선택"으로 표기하므로 상세 미입력도 제출 가능.)
export function isValidReportReason(reason: ProductReportReason | ''): reason is ProductReportReason {
  return PRODUCT_REPORT_REASONS.some(r => r.value === reason)
}

export interface ReportTarget {
  productId: string
  name: string
  storeName: string
  price: number
  thumbnailUrl?: string
}

// 신고 대상 컨텍스트 카드용 상품 정보. 알 수 없는 상품이면 null(화면이 not-found 처리).
export function getReportTargetMock(productId: string): ReportTarget | null {
  const product = findProduct(productId)
  if (!product) return null
  return {
    productId: product.id,
    name: product.name,
    storeName: product.storeName ?? '',
    price: product.price,
    thumbnailUrl: product.thumbnailUrl,
  }
}

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
// (목업이 상세를 "선택"으로 표기하므로 기타 외 사유는 상세 미입력도 제출 가능. 기타는 서버가 상세를 요구해 화면이 막는다.)
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
    storeName: product.storeName,
    price: product.price,
    thumbnailUrl: product.thumbnailUrl,
  }
}

// 신고 대상 조회(비동기). 상품 상세(useProductDetail)와 같은 "로딩 → 있음/없음" 흐름을 갖추기 위해
// 동기 resolver를 mock 지연으로 감싼다 — 실 상품 API로 전환하면 이 함수만 실 fetch로 바꾸면 되고,
// 화면은 로딩 중 스켈레톤을 먼저 보여준 뒤 진짜 없음일 때만 not-found로 간다.
export function fetchReportTarget(productId: string): Promise<ReportTarget | null> {
  return new Promise(resolve => {
    setTimeout(() => resolve(getReportTargetMock(productId)), 150)
  })
}

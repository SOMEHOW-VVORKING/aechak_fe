import { useMutation, useQuery } from '@tanstack/react-query'
import { errorResponse, getProductDetail, submitReport } from '@aechak/api'
import type { ProductReportReason } from '@aechak/domain'
import { findMockProduct, mediaUrl } from '@/shared/catalog'
import { fetchReportTarget, getReportTargetMock, type ReportTarget } from './report.mock'

export interface SubmitReportInput {
  productId: string
  reason: ProductReportReason
  detail: string
}

// 404(진짜 미존재)만 not-found로 보내고 다른 오류(500 등)는 그대로 던진다(가짜 대상으로 위장 금지).
function isNotFound(e: unknown): boolean {
  return errorResponse(e)?.status === 404
}

// 신고 대상 상품 조회. 상세 화면(useProductDetail)과 동일한 해석 전략을 쓴다 — 목업 카탈로그
// 상품(p-*)은 네트워크 없이 목업으로, 실 상품(ULID)은 실 API(GET /products/{id})로 조회한다.
// 실 상품을 목업으로만 해석하면 상세를 거치지 않고 신고 URL로 직접 진입/새로고침할 때 유효한
// 상품도 not-found로 잘못 뜬다 — 그래서 실 API 폴백을 붙였다. 404(진짜 미존재)는 레지스트리로
// 한 번 더 시도한 뒤 없으면 null(not-found), 다른 오류는 그대로 던진다(review/product.queries와 동일).
export function useReportTarget(productId: string) {
  return useQuery<ReportTarget | null>({
    queryKey: ['report', 'target', productId],
    enabled: productId !== '',
    queryFn: async ({ signal }) => {
      if (findMockProduct(productId)) return fetchReportTarget(productId)
      try {
        const res = await getProductDetail(productId, signal)
        const d = res.data
        return {
          productId: d.productId,
          name: d.name,
          storeName: d.seller.storeName,
          price: d.discountPrice ?? d.regularPrice,
          thumbnailUrl: mediaUrl(d.representativeImageKey),
        }
      } catch (e) {
        if (isNotFound(e)) return getReportTargetMock(productId)
        throw e
      }
    },
  })
}

// 화면의 사유 값을 BE 상품 신고 사유 코드로 옮긴다.
const REASON_CODE: Record<ProductReportReason, 'FALSE_AD' | 'INFO_ERROR' | 'ILLEGAL' | 'INAPPROPRIATE' | 'OTHER'> = {
  'false-ad': 'FALSE_AD',
  'wrong-info': 'INFO_ERROR',
  illegal: 'ILLEGAL',
  inappropriate: 'INAPPROPRIATE',
  etc: 'OTHER',
}

// 목업 카탈로그 상품 신고를 가르는 표식. 서버에 없는 상품이라 요청하지 않고 접수할 수 없다고 알린다.
const MOCK_PRODUCT_REPORT = 'mock-product-report'

// 상품 신고 제출(POST /reports).
export function useSubmitReport() {
  return useMutation<void, Error, SubmitReportInput>({
    mutationFn: async ({ productId, reason, detail }) => {
      if (findMockProduct(productId)) throw new Error(MOCK_PRODUCT_REPORT)
      const reasonText = detail.trim()
      await submitReport({
        targetType: 'PRODUCT',
        targetId: productId,
        reasonCode: REASON_CODE[reason],
        reasonText: reasonText === '' ? null : reasonText,
      })
    },
  })
}

export function reportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === MOCK_PRODUCT_REPORT) return '예시 상품은 신고할 수 없어요.'
  switch (errorResponse(error)?.data?.errorCode) {
    case 40303:
      return '이미 신고한 상품이에요.'
    case 40302:
      return '본인 상품은 신고할 수 없어요.'
    case 40300:
      return '기타 사유는 상세 내용을 적어 주세요.'
    case 40000:
      return '신고할 상품을 찾지 못했어요.'
    default:
      return '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

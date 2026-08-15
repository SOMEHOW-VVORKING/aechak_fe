import { useMutation, useQuery } from '@tanstack/react-query'
import { getProductDetail } from '@aechak/api'
import type { ProductReport, ProductReportReason } from '@aechak/domain'
import { findMockProduct, mediaUrl } from '@/shared/catalog'
import { fetchReportTarget, getReportTargetMock, type ReportTarget } from './report.mock'

export interface SubmitReportInput {
  productId: string
  reason: ProductReportReason
  detail: string
}

// 404(진짜 미존재)만 not-found로 보내고 다른 오류(500 등)는 그대로 던진다(가짜 대상으로 위장 금지).
function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } } | null)?.response?.status === 404
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

// 상품 신고 제출 mutation. 실제 접수/검수 큐 연동은 범위 밖이라, 결정적 id를 부여한
// ProductReport를 만들어 mock 지연 후 반환한다(운영 검수 큐로 넘어가는 형태만 시연).
// 신고자 식별 정보는 담지 않는다(신고자 비공개 보호).
export function useSubmitReport() {
  return useMutation<ProductReport, Error, SubmitReportInput>({
    mutationFn: ({ productId, reason, detail }) =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            id: `rp-${productId}-${reason}`,
            productId,
            reason,
            detail: detail.trim(),
            createdAt: new Date().toISOString(),
          })
        }, 500)
      }),
  })
}

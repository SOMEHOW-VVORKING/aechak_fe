import { useMutation, useQuery } from '@tanstack/react-query'
import type { ProductReport, ProductReportReason } from '@aechak/domain'
import { fetchReportTarget, type ReportTarget } from './report.mock'

export interface SubmitReportInput {
  productId: string
  reason: ProductReportReason
  detail: string
}

// 신고 대상 상품 조회. 상세 화면(useProductDetail)과 동일하게 비동기로 해석해 "로딩 → 있음/없음"을
// 구분한다 — 실 상품 API 전환 시 하드 리프레시로 진입해도 로딩 후 정확한 상품/not-found로 갈린다.
export function useReportTarget(productId: string) {
  return useQuery<ReportTarget | null>({
    queryKey: ['report', 'target', productId],
    queryFn: () => fetchReportTarget(productId),
    enabled: productId !== '',
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

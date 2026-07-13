import { useMutation } from '@tanstack/react-query'
import type { ProductReport, ProductReportReason } from '@aechak/domain'

export interface SubmitReportInput {
  productId: string
  reason: ProductReportReason
  detail: string
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

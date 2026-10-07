import { createFileRoute } from '@tanstack/react-router'
import { ReviewWriteScreen } from '@/features/review'

export interface ReviewWriteSearch {
  productId?: string
  orderId?: string
  reviewId?: string
  /** 서버 작성 대기 항목(내 리뷰)에서 진입할 때만. 아래 세 값은 그 항목의 주문 시점 스냅샷이다. */
  orderItemId?: number
  productName?: string
  option?: string
  thumbnailUrl?: string
}

const optionalString = (v: unknown) => (typeof v === 'string' ? v : undefined)

// 리뷰 작성(b4-st-2). ?productId=&orderId= 신규 / ?reviewId= 수정.
export const Route = createFileRoute('/reviews/write')({
  validateSearch: (search: Record<string, unknown>): ReviewWriteSearch => ({
    productId: optionalString(search.productId),
    orderId: optionalString(search.orderId),
    reviewId: optionalString(search.reviewId),
    orderItemId: Number.isSafeInteger(Number(search.orderItemId)) && Number(search.orderItemId) > 0
      ? Number(search.orderItemId)
      : undefined,
    productName: optionalString(search.productName),
    option: optionalString(search.option),
    thumbnailUrl: optionalString(search.thumbnailUrl),
  }),
  component: ReviewWriteRoute,
})

function ReviewWriteRoute() {
  return <ReviewWriteScreen {...Route.useSearch()} />
}

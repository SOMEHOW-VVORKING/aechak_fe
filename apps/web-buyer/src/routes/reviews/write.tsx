import { createFileRoute } from '@tanstack/react-router'
import { ReviewWriteScreen } from '@/features/review'

export interface ReviewWriteSearch {
  productId?: string
  orderId?: string
  reviewId?: string
}

// 리뷰 작성(b4-st-2). ?productId=&orderId= 신규 / ?reviewId= 수정.
export const Route = createFileRoute('/reviews/write')({
  validateSearch: (search: Record<string, unknown>): ReviewWriteSearch => ({
    productId: typeof search.productId === 'string' ? search.productId : undefined,
    orderId: typeof search.orderId === 'string' ? search.orderId : undefined,
    reviewId: typeof search.reviewId === 'string' ? search.reviewId : undefined,
  }),
  component: ReviewWriteRoute,
})

function ReviewWriteRoute() {
  const { productId, orderId, reviewId } = Route.useSearch()
  return <ReviewWriteScreen productId={productId} orderId={orderId} reviewId={reviewId} />
}

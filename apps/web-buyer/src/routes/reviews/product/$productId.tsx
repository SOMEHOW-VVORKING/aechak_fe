import { createFileRoute } from '@tanstack/react-router'
import { ProductReviewsScreen } from '@/features/review'

// 상품 리뷰 목록 / 정렬(b4-st-3). 상품 상세의 "리뷰 전체보기"로 진입.
export const Route = createFileRoute('/reviews/product/$productId')({
  component: ProductReviewsRoute,
})

function ProductReviewsRoute() {
  const { productId } = Route.useParams()
  return <ProductReviewsScreen productId={productId} />
}

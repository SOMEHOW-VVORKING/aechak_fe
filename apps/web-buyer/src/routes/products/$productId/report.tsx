import { createFileRoute } from '@tanstack/react-router'
import { ProductReportScreen } from '@/features/report'

// 상품 신고(b8-st-1-product). 상품 상세에서 진입.
export const Route = createFileRoute('/products/$productId/report')({
  component: ProductReportRoute,
})

function ProductReportRoute() {
  const { productId } = Route.useParams()
  return <ProductReportScreen productId={productId} />
}

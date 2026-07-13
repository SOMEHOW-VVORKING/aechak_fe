import { createFileRoute } from '@tanstack/react-router'
import { ProductDetailScreen } from '@/features/product'

export const Route = createFileRoute('/products/$productId/')({
  component: ProductDetailRoute,
})

function ProductDetailRoute() {
  const { productId } = Route.useParams()
  return <ProductDetailScreen productId={productId} />
}

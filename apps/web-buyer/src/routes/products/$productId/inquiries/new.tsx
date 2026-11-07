import { createFileRoute } from '@tanstack/react-router'
import { ProductInquiryWriteScreen } from '@/features/product-inquiry'

export const Route = createFileRoute('/products/$productId/inquiries/new')({
  component: ProductInquiryWriteRoute,
})

function ProductInquiryWriteRoute() {
  const { productId } = Route.useParams()
  return <ProductInquiryWriteScreen productId={productId} />
}

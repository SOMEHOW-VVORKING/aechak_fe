import { createFileRoute } from '@tanstack/react-router'
import { ProductDetailScreen } from '@/features/product'
import { ProductInquirySection } from '@/features/product-inquiry'

export const Route = createFileRoute('/products/$productId/')({
  component: ProductDetailRoute,
})

function ProductDetailRoute() {
  const { productId } = Route.useParams()
  // 문의 영역은 별도 feature라 상세 화면이 직접 import할 수 없다(feature 간 import 금지) —
  // 라우트가 조립해 슬롯으로 내려 준다.
  return (
    <ProductDetailScreen
      productId={productId}
      inquirySlot={<ProductInquirySection productId={productId} />}
    />
  )
}

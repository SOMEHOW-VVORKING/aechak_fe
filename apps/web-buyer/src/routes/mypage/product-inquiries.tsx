import { createFileRoute } from '@tanstack/react-router'
import { MyProductInquiriesScreen } from '@/features/product-inquiry'

export const Route = createFileRoute('/mypage/product-inquiries')({
  component: MyProductInquiriesRoute,
})

function MyProductInquiriesRoute() {
  return <MyProductInquiriesScreen />
}

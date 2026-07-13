import { createFileRoute } from '@tanstack/react-router'
import { OrderDetailScreen } from '@/features/order'

// 주문 상세 / 배송 추적(b1-st-6). $orderId를 디렉터리로 둬 /cancel 자식과 공존시키되
// 별도 레이아웃(Outlet)을 만들지 않도록 index 형태로 둔다.
export const Route = createFileRoute('/orders/$orderId/')({
  component: OrderDetailRoute,
})

function OrderDetailRoute() {
  const { orderId } = Route.useParams()
  return <OrderDetailScreen orderId={orderId} />
}

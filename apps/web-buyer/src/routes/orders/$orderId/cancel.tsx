import { createFileRoute } from '@tanstack/react-router'
import { OrderCancelScreen } from '@/features/order'

// 주문 취소(b4-st-4). 배송 시작 전 주문만 취소 가능(화면에서 분기).
export const Route = createFileRoute('/orders/$orderId/cancel')({
  component: OrderCancelRoute,
})

function OrderCancelRoute() {
  const { orderId } = Route.useParams()
  return <OrderCancelScreen orderId={orderId} />
}

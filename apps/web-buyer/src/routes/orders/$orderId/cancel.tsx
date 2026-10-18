import { createFileRoute, redirect } from '@tanstack/react-router'
import { OrderCancelScreen } from '@/features/order'

// 주문 취소(b4-st-4). BE 취소 엔드포인트가 없어 직접 URL 진입을 상세로 되돌린다 — 화면 파일은 보존.
export const Route = createFileRoute('/orders/$orderId/cancel')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/orders/$orderId', params: { orderId: params.orderId }, replace: true })
  },
  component: OrderCancelRoute,
})

function OrderCancelRoute() {
  const { orderId } = Route.useParams()
  return <OrderCancelScreen orderId={orderId} />
}

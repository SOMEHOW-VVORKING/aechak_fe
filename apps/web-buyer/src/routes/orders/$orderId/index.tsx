import { createFileRoute } from '@tanstack/react-router'
import { OrderDetailScreen } from '@/features/order'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 주문 상세 / 배송 추적(b1-st-6). $orderId를 디렉터리로 둬 /cancel 자식과 공존시키되
// 별도 레이아웃(Outlet)을 만들지 않도록 index 형태로 둔다.
export const Route = createFileRoute('/orders/$orderId/')({
  component: OrderDetailRoute,
})

// 주문 상세는 회원 전용(GET /orders/{id} 비로그인 401)이라 목록과 같은 자리에서 막는다.
function OrderDetailRoute() {
  const { orderId } = Route.useParams()
  const session = useSessionState()
  if (session === 'guest') return <AuthRequiredScreen feature="order" />
  return <OrderDetailScreen orderId={orderId} />
}

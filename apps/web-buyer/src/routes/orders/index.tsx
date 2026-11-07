import { createFileRoute } from '@tanstack/react-router'
import { OrderListScreen } from '@/features/order'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// full-bleed(탭바 없음) — 주문 목록(b4-st-1). 결제 성공/직접 URL로 진입.
export const Route = createFileRoute('/orders/')({
  component: OrderListRoute,
})

// 주문 내역은 회원 전용(GET /orders 비로그인 401)이다. 판정 근거는 /wishlist와 같다.
function OrderListRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="order" />
  return <OrderListScreen />
}

import { createFileRoute } from '@tanstack/react-router'
import { OrderListScreen } from '@/features/order'

// full-bleed(탭바 없음) — 주문 목록(b4-st-1). 결제 성공/직접 URL로 진입.
export const Route = createFileRoute('/orders/')({
  component: OrderListScreen,
})

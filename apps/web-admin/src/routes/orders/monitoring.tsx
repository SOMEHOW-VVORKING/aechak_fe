import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/orders/monitoring')({
  component: OrdersMonitoringRoute,
})

// 주문·배송 조회는 seller 호스트(`/sellers/me/orders`, 셀러 본인 스코프)와 api 호스트
// (`/orders/{orderId}`, 구매자 본인 스코프)에만 있다. 플랫폼 전체 주문을 보는 admin 경로는 없고,
// web-admin은 sellerOrigin 자체를 설정하지 않아 셀러 경로를 부를 수도 없다(main.tsx).
function OrdersMonitoringRoute() {
  return (
    <UnavailableScreen
      title="주문 배송 모니터링"
      description="플랫폼 전체 주문과 배송 상태를 모니터링합니다."
      message="주문 배송 모니터링은 준비 중이에요"
    />
  )
}

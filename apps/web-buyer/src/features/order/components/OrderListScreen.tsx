import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import { EmptyState, MobileScreen, SegmentedControl } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useOrderList } from '../order.queries'
import { ORDER_SEGMENTS, type OrderSegment } from '../order.mock'
import { OrderCard } from './OrderCard'

// 주문 목록(b4-st-1). 상태 세그먼트 필터(전체/진행중/완료/취소)는 실제로 목록을 거른다.
export function OrderListScreen() {
  const navigate = useNavigate()
  const router = useRouter()
  const [segment, setSegment] = useState<OrderSegment>('all')
  const orders = useOrderList(segment)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/' })
  }

  const openOrder = (id: string) => navigate({ to: '/orders/$orderId', params: { orderId: id } })

  const writeReview = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    const first = order?.groups[0]?.items[0]
    if (!first) return
    navigate({ to: '/reviews/write', search: { productId: first.productId, orderId } })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="주문 내역" />}>
      <div className="flex flex-col gap-3 p-4">
        <SegmentedControl
          options={ORDER_SEGMENTS.map(s => ({ value: s.value, label: s.label }))}
          value={segment}
          onChange={value => setSegment(value as OrderSegment)}
        />

        {orders.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              icon={<Package className="size-8" />}
              title="아직 주문 내역이 없어요"
              description="마음에 드는 상품을 담아 첫 주문을 시작해 보세요."
              action={{ label: '쇼핑하러 가기', onClick: () => navigate({ to: '/market' }) }}
            />
          </div>
        ) : (
          orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onOpen={() => openOrder(order.id)}
              onWriteReview={() => writeReview(order.id)}
            />
          ))
        )}
      </div>
    </MobileScreen>
  )
}

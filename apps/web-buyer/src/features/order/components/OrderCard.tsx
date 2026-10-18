import { ChevronRight } from 'lucide-react'
import type { BuyerOrder, BuyerSellerOrder } from '@aechak/domain'
import { Card, StatusPill } from '@aechak/design-system/web'
import { Divider } from '@/shared/components/Divider'
import { formatKRW } from '@/shared/formatKRW'
import { ProductThumbnail } from '@/shared/catalog'
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  sellerOrderTitle,
  shortDate,
} from '../order.mock'

export interface OrderCardProps {
  order: BuyerOrder
  onOpenSellerOrder: (orderId: string) => void
}

// 주문 목록(b4-st-1) 카드 = 주문그룹 하나. 그룹에는 단일 상태가 없고 셀러 주문마다 상태 pill이 붙는다
// (한 그룹 안에 배송중·배송완료가 섞일 수 있다). 셀러 주문 행 전체가 그 주문의 상세 진입 버튼이다.
export function OrderCard({ order, onOpenSellerOrder }: OrderCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex min-w-0 items-center gap-2 text-caption text-text-tertiary">
        <span className="flex-none">{shortDate(order.orderedAt)} 주문</span>
        <span className="flex-none">/</span>
        <span className="truncate tabular-nums">{order.id}</span>
      </div>

      <Divider />

      {order.sellerOrders.map(so => (
        <SellerOrderRow
          key={so.orderId}
          sellerOrder={so}
          onOpen={() => onOpenSellerOrder(so.orderId)}
        />
      ))}

      <Divider />

      <div className="flex items-baseline justify-between">
        <span className="text-caption text-text-tertiary">결제 금액(주문 전체)</span>
        <span className="text-price-sm font-semibold text-text-price">
          {formatKRW(order.paidAmount)}
        </span>
      </div>
    </Card>
  )
}

function SellerOrderRow({
  sellerOrder,
  onOpen,
}: {
  sellerOrder: BuyerSellerOrder
  onOpen: () => void
}) {
  const rep = sellerOrder.representativeItem
  const cancelled = sellerOrder.status === 'cancelled'
  const title = sellerOrderTitle(sellerOrder)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-caption font-semibold text-text-secondary">
          {sellerOrder.storeName ?? '판매자 정보 없음'}
        </span>
        <StatusPill variant={ORDER_STATUS_VARIANT[sellerOrder.status]} size="sm">
          {ORDER_STATUS_LABEL[sellerOrder.status]}
        </StatusPill>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 text-left"
        aria-label={`${title} 주문 상세 보기`}
      >
        <ProductThumbnail src={rep?.thumbnailUrl} className="size-14" dimmed={cancelled} />
        <div className="min-w-0 flex-1">
          <p
            className={[
              'line-clamp-2 text-body-sm',
              cancelled ? 'text-text-secondary' : 'text-text-primary',
            ].join(' ')}
          >
            {title}
          </p>
          {rep && (
            <p className="mt-0.5 text-caption text-text-tertiary">
              {rep.option} / {rep.quantity}개
            </p>
          )}
        </div>
        <ChevronRight className="size-4 flex-none text-icon-muted" />
      </button>
    </div>
  )
}

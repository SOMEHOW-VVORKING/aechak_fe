import { ChevronRight } from 'lucide-react'
import type { BuyerOrder } from '@aechak/domain'
import { Button, Card, StatusPill } from '@aechak/design-system/web'
import { Divider } from '@/shared/components/Divider'
import { formatKRW } from '@/shared/formatKRW'
import { ProductThumbnail } from '@/shared/catalog'
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  orderItemCount,
  orderTitle,
  shortDate,
} from '../order.mock'

export interface OrderCardProps {
  order: BuyerOrder
  onOpen: () => void
  onWriteReview: () => void
}

// 주문 목록(b4-st-1) 카드. 상품 행 전체가 상세 진입 버튼이고, 리뷰 쓰기 등 액션은 형제로 둬
// 중첩 인터랙티브(버튼 안 버튼)를 피한다(ProductCard와 동일 원칙).
export function OrderCard({ order, onOpen, onWriteReview }: OrderCardProps) {
  const first = order.groups[0]?.items[0]
  const extraCount = orderItemCount(order) - 1
  const reviewable = order.status === 'delivered' || order.status === 'confirmed'
  const cancelled = order.status === 'cancelled'

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-text-tertiary">
          {shortDate(order.orderedAt)} 주문 / <span className="tabular-nums">{order.id}</span>
        </span>
        <StatusPill variant={ORDER_STATUS_VARIANT[order.status]} size="sm">
          {ORDER_STATUS_LABEL[order.status]}
        </StatusPill>
      </div>

      <Divider />

      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 text-left"
        aria-label={`${orderTitle(order)} 주문 상세 보기`}
      >
        <ProductThumbnail src={first?.thumbnailUrl} className="size-14" dimmed={cancelled} />
        <div className="min-w-0 flex-1">
          <p className={['line-clamp-2 text-body-sm', cancelled ? 'text-text-secondary' : 'text-text-primary'].join(' ')}>
            {orderTitle(order)}
          </p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {first?.option}
            {extraCount > 0 ? ` 외 ${extraCount}개` : ''}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className={['text-price-sm font-semibold', cancelled ? 'text-text-tertiary' : 'text-text-price'].join(' ')}>
            {formatKRW(order.paidAmount)}
          </span>
          <ChevronRight className="size-4 text-icon-muted" />
        </div>
      </button>

      {reviewable && (
        <Button variant="primary" size="md" onClick={onWriteReview} className="w-full">
          리뷰 쓰기
        </Button>
      )}
      {cancelled && order.refundedAt && (
        <p className="text-caption text-text-tertiary">환불 {shortDate(order.refundedAt)} 완료</p>
      )}
    </Card>
  )
}

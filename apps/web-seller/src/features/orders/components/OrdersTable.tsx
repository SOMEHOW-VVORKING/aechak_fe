import { WifiOff } from 'lucide-react'
import type { Order, OrderStatus } from '@aechak/domain'
import { Button, DataTable, EmptyState, StatusPill, type Column, type StatusPillVariant } from '@aechak/design-system/web'
import { ORDER_STATUS_LABEL } from '../orders.queries'

const ORDER_STATUS_VARIANT: Record<OrderStatus, StatusPillVariant> = {
  new_order: 'info',
  preparing: 'neutral',
  shipping: 'info',
  delivered: 'success',
}

interface OrdersTableProps {
  orders: Order[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onShip: (order: Order) => void
}

export function OrdersTable({ orders, isLoading, isError, onRetry, onShip }: OrdersTableProps) {
  if (isError) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised">
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="주문을 불러오지 못했어요"
          description="일시적인 오류예요. 잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: onRetry }}
        />
      </div>
    )
  }

  const columns: Column<Order>[] = [
    {
      key: 'id',
      label: '주문번호 / 상품',
      render: o => (
        <div>
          <p className="font-semibold tabular-nums text-text-primary">{o.id}</p>
          <p className="text-caption text-text-tertiary">{o.productName}</p>
        </div>
      ),
    },
    {
      key: 'buyer',
      label: '구매자 / 수령자',
      render: o => `${o.buyerName} / ${o.recipientName}`,
    },
    {
      key: 'totalPrice',
      label: '결제금액',
      align: 'right',
      render: o => <div className="font-semibold tabular-nums">{o.totalPrice.toLocaleString()}원</div>,
    },
    {
      key: 'status',
      label: '주문 상태',
      render: o => (
        <div>
          <StatusPill variant={ORDER_STATUS_VARIANT[o.status]}>{ORDER_STATUS_LABEL[o.status]}</StatusPill>
          {o.status === 'shipping' && o.courier && o.trackingNumber && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">
              {o.courier} {o.trackingNumber}
            </p>
          )}
          {o.status === 'delivered' && o.purchaseConfirmDeadline && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">자동 확정 {o.purchaseConfirmDeadline}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '처리',
      render: o => (
        <div className="flex justify-end">
          {o.status === 'new_order' || o.status === 'preparing' ? (
            <Button variant="primary" size="sm" onClick={() => onShip(o)}>
              발송 처리
            </Button>
          ) : o.status === 'shipping' ? (
            <Button variant="secondary" size="sm" onClick={() => onShip(o)}>
              송장 수정
            </Button>
          ) : (
            <span className="text-caption text-text-tertiary">처리 완료</span>
          )}
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} rows={orders} rowKey={o => o.id} loading={isLoading} />
}

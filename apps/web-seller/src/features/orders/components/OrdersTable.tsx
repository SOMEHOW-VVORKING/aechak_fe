import { WifiOff } from 'lucide-react'
import type { Order, OrderStatus } from '@aechak/domain'
import { Button, Card, DataTable, EmptyState, type Column, type StatusPillVariant } from '@aechak/design-system/web'
import { DoneLabel, PillWithNote, TwoLineCell } from '@/shared/components/TableCells'
import { ORDER_STATUS_LABEL } from '../orders.queries'

const ORDER_STATUS_VARIANT: Record<OrderStatus, StatusPillVariant> = {
  new_order: 'info',
  preparing: 'neutral',
  shipping: 'info',
  delivered: 'success',
}

// 상태 pill 아래 보조 텍스트 — 배송 중이면 송장, 배송 완료면 자동 구매확정 예정일.
function statusNote(o: Order) {
  if (o.status === 'shipping' && o.courier && o.trackingNumber) return `${o.courier} ${o.trackingNumber}`
  if (o.status === 'delivered' && o.purchaseConfirmDeadline) return `자동 확정 ${o.purchaseConfirmDeadline}`
  return undefined
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
      <Card>
        <EmptyState
          icon={<WifiOff className="size-6" />}
          title="주문을 불러오지 못했어요"
          description="일시적인 오류예요. 잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: onRetry }}
        />
      </Card>
    )
  }

  const columns: Column<Order>[] = [
    {
      key: 'id',
      label: '주문번호 / 상품',
      render: o => <TwoLineCell primary={o.id} secondary={o.productName} />,
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
        <PillWithNote variant={ORDER_STATUS_VARIANT[o.status]} label={ORDER_STATUS_LABEL[o.status]} note={statusNote(o)} />
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
            <DoneLabel />
          )}
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} rows={orders} rowKey={o => o.id} loading={isLoading} />
}

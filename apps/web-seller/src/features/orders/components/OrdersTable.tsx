import { Button, DataTable, type Column } from '@aechak/design-system/web'
import { DoneLabel, PillWithNote, TwoLineCell } from '@/shared/components/TableCells'
import {
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  canAcceptOrder,
  canCompleteDelivery,
  canRegisterShipment,
  formatOrderedAt,
  maskContactNumber,
  type SellerOrderSummary,
} from '../orders.contract'

/**
 * 상태 pill 아래 보조 텍스트. 진행 중 클레임이 있으면 그것이 가장 중요한 정보라 먼저 보여주고,
 * 그다음이 송장, 배송완료 건은 자동 구매확정 기한이다.
 */
function statusNote(order: SellerOrderSummary): string | undefined {
  if (order.activeClaim) {
    return `${CLAIM_TYPE_LABEL[order.activeClaim.claimType]} ${CLAIM_STATUS_LABEL[order.activeClaim.status]}`
  }
  if (order.shipment) return `${order.shipment.courierName} ${order.shipment.trackingNumber}`
  if (order.purchaseConfirmDueAt) return `자동 확정 ${order.purchaseConfirmDueAt.slice(0, 10)}`
  return undefined
}

interface OrdersTableProps {
  orders: SellerOrderSummary[]
  isLoading: boolean
  /** 조회 실패 안내는 라우트가 Alert로 그린다 — 표는 빈 상태 문구만 가른다. */
  emptyLabel: string
  /** 처리 중에는 모든 행의 버튼을 잠근다(확인 Modal 패턴 — 값은 라우트의 isMutating). */
  isMutating: boolean
  /**
   * 목록 조회가 실패한 상태. 재조회가 실패하면 직전 성공 데이터가 그대로 남아(placeholderData)
   * 낡은 행에서 처리 버튼이 계속 눌린다 — 확인 Modal은 **그 행의 값**으로 만들어지므로 셀러는
   * 서버에 없는 상태를 보고 되돌릴 수 없는 전이를 지시하게 된다(권한이 끊긴 403이면 전부 실패한다).
   * 그래서 조회가 실패한 동안에는 처리 버튼을 잠근다 — ClaimDetailDrawer가 상세 조회 실패에
   * 쓰는 규칙과 같다. 행 클릭(상세 열기)은 막지 않는다: 상세는 스스로 다시 조회한다.
   */
  isError: boolean
  onRowClick: (order: SellerOrderSummary) => void
  onAccept: (order: SellerOrderSummary) => void
  onShip: (order: SellerOrderSummary) => void
  onCompleteDelivery: (order: SellerOrderSummary) => void
}

export function OrdersTable({
  orders,
  isLoading,
  emptyLabel,
  isMutating,
  isError,
  onRowClick,
  onAccept,
  onShip,
  onCompleteDelivery,
}: OrdersTableProps) {
  // 낡은 행으로 되돌릴 수 없는 전이를 지시하지 않게, 처리 중이거나 조회가 실패한 동안 잠근다.
  const actionsLocked = isMutating || isError

  // 행 클릭이 상세를 열므로, 액션 버튼은 클릭이 행까지 올라가지 않게 막는다.
  const actionHandler = (run: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    run()
  }

  const columns: Column<SellerOrderSummary>[] = [
    {
      key: 'orderId',
      label: '주문번호 / 주문일',
      render: o => <TwoLineCell primary={o.orderId} secondary={formatOrderedAt(o.orderedAt)} />,
    },
    {
      key: 'recipient',
      // 연락처는 서버가 평문으로 주고 목록에서만 가운데를 가린다(상세에서는 그대로 — maskContactNumber 주석).
      label: '수령인 / 연락처',
      render: o => <TwoLineCell primary={o.recipientName} secondary={maskContactNumber(o.contactNumber)} />,
    },
    {
      key: 'itemCount',
      label: '품목',
      align: 'right',
      render: o => <span className="tabular-nums">{o.itemCount.toLocaleString()}개</span>,
    },
    {
      key: 'payableAmount',
      label: '결제금액',
      align: 'right',
      render: o => <div className="font-semibold tabular-nums">{o.payableAmount.toLocaleString()}원</div>,
    },
    {
      key: 'status',
      // StatusPill + 보조텍스트 컬럼은 center 금지(pill과 좌측이 어긋난다) — AGENTS 4절.
      label: '주문 상태',
      render: o => (
        <PillWithNote
          variant={ORDER_STATUS_VARIANT[o.status]}
          label={ORDER_STATUS_LABEL[o.status]}
          note={statusNote(o)}
        />
      ),
    },
    {
      key: 'actions',
      label: '처리',
      render: o => (
        <div className="flex justify-end">
          {canAcceptOrder(o.status) ? (
            <Button
              variant="primary"
              size="sm"
              disabled={actionsLocked}
              aria-label={`주문 ${o.orderId} 발주 확인`}
              onClick={actionHandler(() => onAccept(o))}
            >
              발주 확인
            </Button>
          ) : canRegisterShipment(o.status, o.shipment != null) ? (
            <Button
              variant="primary"
              size="sm"
              disabled={actionsLocked}
              aria-label={`주문 ${o.orderId} 발송 처리`}
              onClick={actionHandler(() => onShip(o))}
            >
              발송 처리
            </Button>
          ) : canCompleteDelivery(o.status) ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={actionsLocked}
              aria-label={`주문 ${o.orderId} 배송 완료`}
              onClick={actionHandler(() => onCompleteDelivery(o))}
            >
              배송 완료
            </Button>
          ) : (
            <DoneLabel />
          )}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={orders}
      rowKey={o => o.orderId}
      loading={isLoading}
      emptyLabel={emptyLabel}
      onRowClick={onRowClick}
    />
  )
}

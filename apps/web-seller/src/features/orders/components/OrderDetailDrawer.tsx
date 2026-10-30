import { Image as ImageIcon } from 'lucide-react'
import { Alert, Button, Drawer, Skeleton, StatusPill } from '@aechak/design-system/web'
import {
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  formatDeliveryAddress,
  formatOrderedAt,
  orderErrorMessage,
  type SellerOrderDetail,
} from '../orders.contract'
import { useSellerOrderDetail } from '../orders.queries'

interface OrderDetailDrawerProps {
  /** null이면 닫힘 — 그 상태에서는 상세 조회가 나가지 않는다(queries의 skipToken). */
  orderPublicId: string | null
  onClose: () => void
}

/** 라벨-값 한 줄. web-admin의 DetailField와 같은 결이지만 DS로 올리지 않는다(재사용처가 여기뿐). */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-24 flex-none text-label text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 text-body-sm text-text-primary">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-1 text-label font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  )
}

const amount = (value: number) => `${value.toLocaleString()}원`

function DetailBody({ order }: { order: SellerOrderDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <StatusPill variant={ORDER_STATUS_VARIANT[order.status]}>{ORDER_STATUS_LABEL[order.status]}</StatusPill>
        <span className="text-caption tabular-nums text-text-tertiary">{formatOrderedAt(order.orderedAt)}</span>
      </div>

      {order.activeClaim && (
        // 진행 중 클레임은 발송·배송완료 판단을 바꾸므로 가장 위에 띄운다. 승인·거부 처리 경로는
        // 셀러센터 클레임 화면 소관이라 여기서는 알리기만 한다.
        <Alert variant="warning">
          {CLAIM_TYPE_LABEL[order.activeClaim.claimType]} 요청이 진행 중이에요(
          {CLAIM_STATUS_LABEL[order.activeClaim.status]}).
        </Alert>
      )}

      <Section title="주문">
        <Row label="주문번호" value={<span className="tabular-nums">{order.orderId}</span>} />
        <Row label="주문그룹" value={<span className="tabular-nums">{order.orderGroupId}</span>} />
        <Row label="구매자" value={order.buyerNickname} />
        {order.purchaseConfirmDueAt && (
          <Row
            label="자동 확정"
            value={<span className="tabular-nums">{formatOrderedAt(order.purchaseConfirmDueAt)}</span>}
          />
        )}
      </Section>

      <Section title="배송지">
        {/* 수령인명·연락처는 서버가 평문으로 주고 상세에서는 가리지 않는다 — 송장을 붙이려면
            온전히 봐야 하는 값이다(목록에서만 가운데를 가린다, orders.contract 주석). */}
        <Row label="수령인" value={order.recipientName} />
        <Row label="연락처" value={<span className="tabular-nums">{order.contactNumber}</span>} />
        <Row label="주소" value={formatDeliveryAddress(order)} />
        {order.deliveryMemo && <Row label="요청사항" value={order.deliveryMemo} />}
      </Section>

      <Section title="품목">
        <ul className="flex flex-col gap-3">
          {order.items.map(item => (
            <li key={item.orderItemId} className="flex items-start gap-3">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-10 flex-none rounded-md object-cover"
                />
              ) : (
                <span className="flex size-10 flex-none items-center justify-center rounded-md bg-surface-sunken text-icon">
                  <ImageIcon className="size-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-text-primary">{item.productName}</p>
                <p className="text-caption text-text-tertiary">
                  {item.optionName} / {item.quantity}개
                  {item.itemStatus !== 'ORDERED' && ` / ${ORDER_ITEM_STATUS_LABEL[item.itemStatus]}`}
                </p>
              </div>
              <div className="flex-none text-right text-body-sm tabular-nums text-text-primary">
                {amount(item.unitPrice * item.quantity)}
                {item.discountAllocatedAmount > 0 && (
                  <p className="text-caption text-text-tertiary">
                    할인 -{amount(item.discountAllocatedAmount)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="금액">
        <Row label="상품금액" value={<span className="tabular-nums">{amount(order.totalProductAmount)}</span>} />
        <Row label="배송비" value={<span className="tabular-nums">{amount(order.sellerShippingFee)}</span>} />
        {order.allocatedCouponDiscount > 0 && (
          <Row
            label="쿠폰 할인"
            value={<span className="tabular-nums">-{amount(order.allocatedCouponDiscount)}</span>}
          />
        )}
        <Row
          label="결제금액"
          value={<span className="font-semibold tabular-nums">{amount(order.payableAmount)}</span>}
        />
      </Section>

      {order.shipment && (
        <Section title="배송">
          <Row label="택배사" value={order.shipment.courierName} />
          <Row label="송장번호" value={<span className="tabular-nums">{order.shipment.trackingNumber}</span>} />
          {order.shipment.dispatchedAt && (
            <Row
              label="발송일"
              value={<span className="tabular-nums">{formatOrderedAt(order.shipment.dispatchedAt)}</span>}
            />
          )}
          {order.shipment.deliveredAt && (
            <Row
              label="배송완료"
              value={<span className="tabular-nums">{formatOrderedAt(order.shipment.deliveredAt)}</span>}
            />
          )}
          {/* 택배사가 준 자유 문자열이라 고정 어휘로 접지 않고 그대로 띄운다. */}
          {order.shipment.lastTrackingStatus && (
            <Row label="추적 상태" value={order.shipment.lastTrackingStatus} />
          )}
        </Section>
      )}
    </div>
  )
}

export function OrderDetailDrawer({ orderPublicId, onClose }: OrderDetailDrawerProps) {
  const detail = useSellerOrderDetail(orderPublicId)

  return (
    <Drawer open={orderPublicId !== null} onClose={onClose} title="주문 상세" width="lg">
      {/* 조회 실패를 삼키면 빈 Drawer가 "품목이 없는 주문"처럼 보인다 — 로딩·실패·성공 셋을 가른다. */}
      {detail.isLoading && (
        <div role="status" aria-label="주문 상세를 불러오는 중" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {detail.isError && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">{orderErrorMessage(detail.error)}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}
      {detail.data && <DetailBody order={detail.data} />}
    </Drawer>
  )
}

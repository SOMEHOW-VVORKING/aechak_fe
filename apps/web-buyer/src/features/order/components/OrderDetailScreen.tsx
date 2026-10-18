import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck, RotateCcw, Truck } from 'lucide-react'
import type { BuyerOrderDetail, BuyerOrderItem, BuyerOrderStatus } from '@aechak/domain'
import { Card, MobileScreen, Skeleton, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { PriceRow } from '@/shared/components/PriceRow'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import { OrderItemsCard } from '@/shared/catalog'
import { isOrderNotFound, orderErrorMessage } from '@/shared/order'
import { useOrder } from '../order.queries'
import {
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  formatOrderedAt,
} from '../order.mock'

// 셀러 주문 상세(b1-st-6). 서버 응답(GET /orders/{orderId})에 있는 것만 그린다 — 배송지·운송장·타임라인·
// 자동확정 예정일은 응답에 없어 표시하지 않는다. 취소·구매확정·리뷰 작성은 BE가 없어 진입점을 두지 않는다.
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { order, isPending, isSuccess, isError, error, refetch } = useOrder(orderId)

  const goBack = useSafeBack({ to: '/orders' })
  const header = <BackAppBar onBack={goBack} title="주문 상세" />

  // 데이터도 에러도 없으면(첫 로딩·오프라인 paused) 스켈레톤 — '찾을 수 없어요'로 위장하지 않는다.
  if (isPending) {
    return (
      <MobileScreen header={header}>
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          <Skeleton variant="rect" className="h-12 w-full" />
          <Skeleton variant="rect" className="h-32 w-full" />
          <Skeleton variant="rect" className="h-40 w-full" />
        </div>
      </MobileScreen>
    )
  }

  // 없음·남의 것·결제대기는 서버가 404(50000) 하나로 통일한다. 조회는 됐지만 표시할 수 없는 상태(결제대기 null)도
  // 같이 다룬다. 그 밖의 오류는 아래 '불러오지 못했어요 + 다시 시도'.
  if ((isError && isOrderNotFound(error)) || (isSuccess && order == null)) {
    return (
      <MobileScreen header={header}>
        <ScreenEmptyState
          title="주문을 찾을 수 없어요"
          description="삭제되었거나 주소가 올바르지 않은 주문이에요."
          action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
        />
      </MobileScreen>
    )
  }

  if (isError || order == null) {
    return (
      <MobileScreen header={header}>
        <ScreenEmptyState
          title="주문을 불러오지 못했어요"
          description={orderErrorMessage(error)}
          action={{ label: '다시 시도', onClick: refetch }}
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen header={header}>
      <div className="flex flex-col gap-3 p-4">
        {/* 주문번호 / 일시 / 상태 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-text-tertiary">주문번호</p>
            <p className="truncate tabular-nums text-body-sm text-text-primary">{order.orderId}</p>
            <p className="mt-0.5 text-caption text-text-tertiary">
              {formatOrderedAt(order.orderedAt)}
            </p>
          </div>
          <StatusPill variant={ORDER_STATUS_VARIANT[order.status]} size="sm">
            {ORDER_STATUS_LABEL[order.status]}
          </StatusPill>
        </div>

        <StatusBanner status={order.status} />

        {/* 주문 상품(이 셀러 주문의 전체 품목) */}
        <OrderItemsCard
          storeName={order.storeName ?? '판매자 정보 없음'}
          items={order.items.map((item, i) => ({
            key: `${order.orderId}-${i}`,
            thumbnailUrl: item.thumbnailUrl,
            name: item.name,
            meta: itemMeta(item),
            price: formatKRW(item.unitPrice * item.quantity),
          }))}
        />

        <PaymentCard order={order} />

        <p className="text-caption text-text-tertiary">
          주문그룹 번호 <span className="tabular-nums">{order.orderGroupId}</span>
          {' / '}같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요.
        </p>
      </div>
    </MobileScreen>
  )
}

// "옵션 / N개" + 품목 상태(취소/반품 요청 등, 정상이면 없음).
function itemMeta(item: BuyerOrderItem): string {
  const base = `${item.option} / ${item.quantity}개`
  const status = ORDER_ITEM_STATUS_LABEL[item.itemStatus]
  return status ? `${base} / ${status}` : base
}

// 결제 정보 — 배송비만 이 셀러 주문 몫이고 나머지 금액은 주문그룹 전체 값이라 두 블록으로 나눠 라벨로 구분한다.
function PaymentCard({ order }: { order: BuyerOrderDetail }) {
  const { groupPayment, sellerShippingFee } = order
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="mb-0.5 text-caption font-semibold text-text-tertiary">이 주문의 배송비</p>
      <PriceRow
        label="배송비"
        value={sellerShippingFee === 0 ? '무료' : formatKRW(sellerShippingFee)}
        valueClass={sellerShippingFee === 0 ? 'text-success-fg' : 'text-text-primary'}
      />

      <Divider className="my-1" />

      <p className="mb-0.5 text-caption font-semibold text-text-tertiary">결제 금액(주문 전체)</p>
      <PriceRow label="상품 금액" value={formatKRW(groupPayment.itemsTotal)} />
      <PriceRow
        label="배송비"
        value={groupPayment.shippingTotal === 0 ? '무료' : formatKRW(groupPayment.shippingTotal)}
        valueClass={groupPayment.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
      />
      {groupPayment.couponDiscount > 0 && (
        <PriceRow
          label="쿠폰 할인"
          value={`-${formatKRW(groupPayment.couponDiscount)}`}
          valueClass="text-text-accent"
        />
      )}
      {groupPayment.pointsUsed > 0 && (
        <PriceRow
          label="적립금 사용"
          value={`-${formatKRW(groupPayment.pointsUsed)}`}
          valueClass="text-text-accent"
        />
      )}
      <Divider className="my-0.5" />
      <div className="flex items-baseline justify-between">
        <span className="text-label font-bold text-text-primary">총 결제금액</span>
        <span className="text-price-sm font-bold text-text-price">
          {formatKRW(groupPayment.paidAmount)}
        </span>
      </div>
    </Card>
  )
}

function StatusBanner({ status }: { status: BuyerOrderStatus }) {
  if (status === 'delivered') {
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-success-border bg-success-surface px-4 py-3">
        <BadgeCheck className="size-5 flex-none text-success-fg" />
        <div>
          <p className="text-label font-semibold text-success-fg">배송완료</p>
          <p className="text-caption text-text-secondary">상품이 도착했어요.</p>
        </div>
      </div>
    )
  }
  if (status === 'shipping') {
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-info-border bg-info-surface px-4 py-3">
        <Truck className="size-5 flex-none text-info-fg" />
        <div>
          <p className="text-label font-semibold text-info-fg">배송중</p>
          <p className="text-caption text-text-secondary">상품이 열심히 오고 있어요.</p>
        </div>
      </div>
    )
  }
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
        <RotateCcw className="size-5 flex-none text-icon-muted" />
        <div>
          <p className="text-label font-semibold text-text-secondary">주문 취소</p>
          <p className="text-caption text-text-tertiary">취소된 주문이에요.</p>
        </div>
      </div>
    )
  }
  return null
}

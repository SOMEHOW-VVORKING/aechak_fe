import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck, RotateCcw, Truck } from 'lucide-react'
import type {
  BuyerOrderClaim,
  BuyerOrderDeliveryAddress,
  BuyerOrderDetail,
  BuyerOrderItem,
  BuyerOrderShipment,
  BuyerOrderStatus,
} from '@aechak/domain'
import { Button, Card, MobileScreen, Modal, Skeleton, StatusPill } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { PriceRow } from '@/shared/components/PriceRow'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import { OrderItemsCard } from '@/shared/catalog'
import { formatPhone } from '@/shared/delivery-address'
import {
  confirmPurchaseErrorMessage,
  isAlreadyConfirmed,
  isOrderNotFound,
  orderErrorMessage,
  useConfirmPurchase,
} from '@/shared/order'
import { useOrder } from '../order.queries'
import {
  CLAIM_REFUND_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  CLAIM_TYPE_LABEL,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  confirmDueRemaining,
  formatOrderedAt,
  isConfirmable,
  isReviewable,
  shortDateTime,
} from '../order.mock'

// 셀러 주문 상세(b1-st-6). 서버 응답(GET /orders/{orderId})에 있는 것만 그린다.
// 구매확정은 POST /orders/{orderPublicId}/confirm이고 **비가역**이라 확인 Modal을 거친다.
// 취소·반품 요청·철회는 사유 코드 어휘가 미확정이라(SCRUM-273) 진입점을 두지 않는다 —
// 진행 중 클레임(activeClaim)은 읽어서 보여주기만 한다.
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { order, isPending, isSuccess, isError, error, refetch } = useOrder(orderId)
  const { confirm, isPending: isConfirming } = useConfirmPurchase()

  // 확인 Modal의 타겟은 라우트가 소유한다(Modal이 자체 mutation을 만들지 않는다).
  const [confirmTarget, setConfirmTarget] = useState<BuyerOrderDetail | null>(null)
  const [toast, setToast] = useState<{
    open: boolean
    message: string
    variant: 'success' | 'error'
  }>({ open: false, message: '', variant: 'success' })

  const goBack = useSafeBack({ to: '/orders' })

  const goProduct = (productId: string) =>
    navigate({ to: '/products/$productId', params: { productId } })

  // 리뷰 작성은 주문 품목 id가 대상을 지목하고, 이름·옵션·썸네일은 주문 시점 스냅샷을 그대로 넘긴다
  // (작성 화면이 새로고침돼도 같은 상품을 그린다 — 내 리뷰의 작성 대기 진입과 같은 계약).
  const goWriteReview = (item: BuyerOrderItem) =>
    navigate({
      to: '/reviews/write',
      search: {
        productId: item.productId,
        orderItemId: item.orderItemId,
        productName: item.name,
        option: item.option,
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
      },
    })

  const handleConfirm = () => {
    if (!confirmTarget) return
    confirm(confirmTarget.orderId, {
      onSuccess: () => {
        setConfirmTarget(null)
        setToast({ open: true, message: '구매확정했어요. 적립금이 지급돼요', variant: 'success' })
      },
      onError: confirmError => {
        setConfirmTarget(null)
        // 이미 확정된 건(50008)은 거절이지만 사용자가 원한 결과다 — 자동확정이 앞질렀을 뿐이라
        // 실패로 겁주지 않고 사실만 알린다(캐시는 어댑터가 onSettled에서 무효화한다).
        setToast({
          open: true,
          message: confirmPurchaseErrorMessage(confirmError),
          variant: isAlreadyConfirmed(confirmError) ? 'success' : 'error',
        })
      },
    })
  }

  /**
   * 본문만 분기하고 확인 Modal·토스트는 **어느 분기에서도 함께 렌더**한다.
   * 구매확정 어댑터가 onSettled에서 캐시 무효화를 await하므로 성공 콜백은 재조회가 끝난 뒤에 돈다 —
   * 그 재조회가 실패하면 상세는 오류 분기로 떨어진다. 토스트를 본문 안에 두면 그때 함께 사라져
   * **비가역 처리가 성공했는데 사용자는 조회 실패만 보게 된다**(codex 지적).
   */
  const screen = (content: ReactNode) => (
    <MobileScreen header={<BackAppBar onBack={goBack} title="주문 상세" />}>
      {content}

      {confirmTarget && (
        <Modal
          open
          onClose={() => setConfirmTarget(null)}
          title="구매확정할까요?"
          description="구매확정은 되돌릴 수 없어요. 확정하면 적립금이 지급되고, 이때부터 반품 기한이 계산돼요."
          // 뒤에 깔린 화면의 구매확정 버튼과 라벨이 겹치지 않게 다르게 적는다(스크린리더·자동화 모두 모호해진다).
          confirmLabel="확정할게요"
          onConfirm={handleConfirm}
          loading={isConfirming}
        />
      )}

      <AppToast
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )

  // 데이터도 에러도 없으면(첫 로딩·오프라인 paused) 스켈레톤 — '찾을 수 없어요'로 위장하지 않는다.
  if (isPending) {
    return screen(
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton variant="rect" className="h-12 w-full" />
        <Skeleton variant="rect" className="h-32 w-full" />
        <Skeleton variant="rect" className="h-40 w-full" />
      </div>,
    )
  }

  // 없음·남의 것·결제대기는 서버가 404(50000) 하나로 통일한다. 조회는 됐지만 표시할 수 없는 상태(결제대기 null)도
  // 같이 다룬다. 그 밖의 오류는 아래 '불러오지 못했어요 + 다시 시도'.
  if ((isError && isOrderNotFound(error)) || (isSuccess && order == null)) {
    return screen(
      <ScreenEmptyState
        title="주문을 찾을 수 없어요"
        description="삭제되었거나 주소가 올바르지 않은 주문이에요."
        action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
      />,
    )
  }

  if (isError || order == null) {
    return screen(
      <ScreenEmptyState
        title="주문을 불러오지 못했어요"
        description={orderErrorMessage(error)}
        action={{ label: '다시 시도', onClick: refetch }}
      />,
    )
  }

  return screen(
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

      {order.activeClaim && <ActiveClaimCard claim={order.activeClaim} />}

      {/* 구매확정은 배송완료 직후가 쓰는 자리라 스크롤 없이 닿는 위치에 둔다(서버 판정은 isConfirmable과 동일). */}
      {isConfirmable(order) && (
        <ConfirmSection
          dueAt={order.purchaseConfirmDueAt}
          loading={isConfirming}
          onClick={() => setConfirmTarget(order)}
        />
      )}

      {/* 주문 상품(이 셀러 주문의 전체 품목) */}
      <OrderItemsCard
        storeName={order.storeName ?? '판매자 정보 없음'}
        items={order.items.map(item => ({
          key: String(item.orderItemId),
          thumbnailUrl: item.thumbnailUrl,
          name: item.name,
          meta: itemMeta(item),
          price: formatKRW(item.unitPrice * item.quantity),
          onSelect: () => goProduct(item.productId),
          selectLabel: `${item.name} 상품 보기`,
          action: isReviewable(order, item) ? (
            <Button variant="secondary" size="sm" onClick={() => goWriteReview(item)}>
              리뷰 쓰기
            </Button>
          ) : undefined,
        }))}
      />

      <ShipmentCard shipment={order.shipment} status={order.status} />

      {order.deliveryAddress && <DeliveryAddressCard address={order.deliveryAddress} />}

      <PaymentCard order={order} />

      <p className="text-caption text-text-tertiary">
        주문그룹 번호 <span className="tabular-nums">{order.orderGroupId}</span>
        {' / '}같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요.
      </p>
    </div>,
  )
}

// "옵션 / N개" + 품목 상태(취소/반품 요청 등, 정상이면 없음).
function itemMeta(item: BuyerOrderItem): string {
  const base = `${item.option} / ${item.quantity}개`
  const status = ORDER_ITEM_STATUS_LABEL[item.itemStatus]
  return status ? `${base} / ${status}` : base
}

// 진행 중 취소·반품·교환(읽기 전용). 요청·철회 버튼은 두지 않는다 — 사유 코드 어휘 미확정(SCRUM-273).
function ActiveClaimCard({ claim }: { claim: BuyerOrderClaim }) {
  const refund = claim.refundStatus ? CLAIM_REFUND_STATUS_LABEL[claim.refundStatus] : undefined
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label font-semibold text-text-primary">
          {CLAIM_TYPE_LABEL[claim.claimType]} 진행 중
        </p>
        <StatusPill variant={CLAIM_STATUS_VARIANT[claim.status]} size="sm">
          {CLAIM_STATUS_LABEL[claim.status]}
        </StatusPill>
      </div>
      {refund && <p className="pl-0.5 text-caption text-text-secondary">{refund}</p>}
      <p className="text-caption text-text-tertiary">
        처리 상황은 고객센터로 문의해 주세요. 진행 중에는 구매확정할 수 없어요.
      </p>
    </Card>
  )
}

// 배송 조회 — 송장이 등록된 뒤에만 서버가 내려준다(발송 전에는 안내 문구).
function ShipmentCard({
  shipment,
  status,
}: {
  shipment?: BuyerOrderShipment
  status: BuyerOrderStatus
}) {
  if (!shipment) {
    // 취소된 주문은 발송 자체가 없어 '발송 준비 중' 안내가 거짓이 된다.
    if (status === 'cancelled') return null
    return (
      <Card className="p-4">
        <p className="mb-1 text-caption font-semibold text-text-tertiary">배송 조회</p>
        <p className="text-body-sm text-text-secondary">
          송장이 등록되면 택배사와 운송장 번호를 보여드려요.
        </p>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-caption font-semibold text-text-tertiary">배송 조회</p>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm text-text-secondary">{shipment.courierName}</span>
        <span className="tabular-nums text-body-sm font-semibold text-text-primary">
          {shipment.trackingNumber}
        </span>
      </div>
      {shipment.dispatchedAt && (
        <PriceRow label="발송" value={shortDateTime(shipment.dispatchedAt)} />
      )}
      {shipment.deliveredAt && (
        <PriceRow label="배송완료" value={shortDateTime(shipment.deliveredAt)} />
      )}
      {/* 택배사 추적 동기화가 아직 없어 보통 비어 있다 — 값이 올 때만 그린다. */}
      {shipment.lastTrackingStatus && (
        <PriceRow label="최근 상태" value={shipment.lastTrackingStatus} />
      )}
    </Card>
  )
}

// 주문 시점 배송지 스냅샷. 주소록을 나중에 고쳐도 이 값은 바뀌지 않는다.
function DeliveryAddressCard({ address }: { address: BuyerOrderDeliveryAddress }) {
  return (
    <Card className="p-4">
      <p className="mb-1.5 text-caption font-semibold text-text-tertiary">배송지</p>
      <p className="text-body-sm text-text-primary">
        {address.receiverName} / {formatPhone(address.contactNumber)}
      </p>
      <p className="mt-0.5 text-body-sm text-text-secondary">
        ({address.zipCode}) {address.baseAddress}
        {address.detailAddress ? ` ${address.detailAddress}` : ''}
      </p>
      {address.deliveryMemo && (
        <p className="mt-1 text-caption text-text-tertiary">요청사항 / {address.deliveryMemo}</p>
      )}
    </Card>
  )
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

// 구매확정 버튼 + 자동확정 기한. 기한을 모르거나 이미 지난 경우에는 남은 시간 문구를 숨긴다.
function ConfirmSection({
  dueAt,
  loading,
  onClick,
}: {
  dueAt?: string
  loading: boolean
  onClick: () => void
}) {
  const remaining = dueAt ? confirmDueRemaining(dueAt) : null
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" fullWidth loading={loading} onClick={onClick}>
        구매확정
      </Button>
      <p className="text-caption text-text-tertiary">
        {dueAt
          ? `확정하지 않으면 ${shortDateTime(dueAt)}에 자동으로 구매확정돼요${remaining ? ` / ${remaining}` : ''}.`
          : '구매확정하면 적립금이 지급되고 리뷰를 쓸 수 있어요.'}
      </p>
    </div>
  )
}

function StatusBanner({ status }: { status: BuyerOrderStatus }) {
  if (status === 'confirmed') {
    return (
      <div className="flex items-center gap-2.5 rounded-card border border-success-border bg-success-surface px-4 py-3">
        <BadgeCheck className="size-5 flex-none text-success-fg" />
        <div>
          <p className="text-label font-semibold text-success-fg">구매확정</p>
          <p className="text-caption text-text-secondary">이제 리뷰를 쓸 수 있어요.</p>
        </div>
      </div>
    )
  }
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

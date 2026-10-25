import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck, RotateCcw, Truck } from 'lucide-react'
import type {
  BuyerClaimType,
  BuyerOrderClaim,
  BuyerOrderDeliveryAddress,
  BuyerOrderDetail,
  BuyerOrderItem,
  BuyerOrderShipment,
  BuyerOrderStatus,
  BuyerSellerOrder,
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
  canRequestClaim,
  claimListErrorMessage,
  confirmPurchaseErrorMessage,
  isAlreadyConfirmed,
  isOrderNotFound,
  isWithdrawable,
  orderErrorMessage,
  useConfirmPurchase,
  useOrderClaims,
  useOrderGroup,
  useWithdrawClaim,
  withdrawClaimErrorMessage,
} from '@/shared/order'
import { useOrder } from '../order.queries'
import {
  CLAIM_ACTION_LABEL,
  CLAIM_COST_BEARER_LABEL,
  CLAIM_REFUND_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  CLAIM_TYPE_LABEL,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  claimTargetSummary,
  claimTimelineAt,
  confirmDueRemaining,
  formatOrderedAt,
  isConfirmable,
  isReviewable,
  shortDateTime,
} from '../order.mock'

// 셀러 주문 상세(b1-st-6). 서버 응답(GET /orders/{orderId})에 있는 것만 그린다.
// 구매확정은 POST /orders/{orderPublicId}/confirm이고 **비가역**이라 확인 Modal을 거친다.
// 클레임(취소·반품·교환)은 요청이 별 화면(`/orders/$orderId/claim?type=`)이고, 내역 조회와 철회는
// 이 화면이 직접 부른다(GET·DELETE /orders/{id}/claims). 진행 중 클레임이 있으면 구매확정과
// 새 클레임 요청이 둘 다 잠긴다 — 서버 판정(409 50007·50403)을 화면이 먼저 설명하는 자리다.
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { order, isPending, isSuccess, isError, error, refetch } = useOrder(orderId)
  const { confirm, isPending: isConfirming } = useConfirmPurchase()
  const claims = useOrderClaims(orderId)
  const { withdraw, isPending: isWithdrawing } = useWithdrawClaim()
  // 같은 결제의 형제 주문. 주문그룹 번호는 상세 응답에 실려 오므로 상세가 오기 전에는 쿼리가 쉰다.
  const { group } = useOrderGroup(order?.orderGroupId)

  // 확인 Modal의 타겟은 라우트가 소유한다(Modal이 자체 mutation을 만들지 않는다).
  const [confirmTarget, setConfirmTarget] = useState<BuyerOrderDetail | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<BuyerOrderClaim | null>(null)
  const [toast, setToast] = useState<{
    open: boolean
    message: string
    variant: 'success' | 'error'
  }>({ open: false, message: '', variant: 'success' })

  const goBack = useSafeBack({ to: '/orders' })

  const goProduct = (productId: string) =>
    navigate({ to: '/products/$productId', params: { productId } })

  const goClaim = (type: BuyerClaimType) =>
    navigate({ to: '/orders/$orderId/claim', params: { orderId }, search: { type } })

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

  const handleWithdraw = () => {
    if (!withdrawTarget) return
    const type = CLAIM_TYPE_LABEL[withdrawTarget.claimType]
    withdraw(
      { orderId, claimPublicId: withdrawTarget.claimPublicId },
      {
        onSuccess: () => {
          setWithdrawTarget(null)
          setToast({ open: true, message: `${type} 요청을 철회했어요`, variant: 'success' })
        },
        onError: withdrawError => {
          setWithdrawTarget(null)
          setToast({
            open: true,
            message: withdrawClaimErrorMessage(withdrawError),
            variant: 'error',
          })
        },
      },
    )
  }

  /**
   * 본문만 분기하고 확인 Modal·토스트는 **어느 분기에서도 함께 렌더**한다.
   * 구매확정·철회 어댑터가 onSettled에서 캐시 무효화를 await하므로 성공 콜백은 재조회가 끝난 뒤에 돈다 —
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
          // 확정은 반품·교환 경로를 닫는다 — 서버는 배송완료 상태에서만 두 유형을 받는다.
          // 적립금을 얻는 대신 잃는 것을 적지 않으면 비가역 처리를 설명하지 않은 것이다.
          description="구매확정은 되돌릴 수 없어요. 확정하면 적립금이 지급되고, 반품과 교환은 더 이상 신청할 수 없어요."
          // 뒤에 깔린 화면의 구매확정 버튼과 라벨이 겹치지 않게 다르게 적는다(스크린리더·자동화 모두 모호해진다).
          confirmLabel="확정할게요"
          onConfirm={handleConfirm}
          loading={isConfirming}
        />
      )}

      {withdrawTarget && (
        <Modal
          open
          onClose={() => setWithdrawTarget(null)}
          title={`${CLAIM_TYPE_LABEL[withdrawTarget.claimType]} 요청을 철회할까요?`}
          description="철회하면 요청이 취소되고, 조건이 맞으면 다시 신청할 수 있어요."
          confirmLabel="철회할게요"
          cancelLabel="닫기"
          onConfirm={handleWithdraw}
          loading={isWithdrawing}
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

  const siblings = (group?.sellerOrders ?? []).filter(so => so.orderId !== order.orderId)

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

      <ClaimsCard
        order={order}
        claims={claims.claims}
        isPending={claims.isPending}
        isError={claims.isError}
        errorMessage={claimListErrorMessage(claims.error)}
        onRetry={claims.refetch}
        onWithdraw={setWithdrawTarget}
        withdrawDisabled={isWithdrawing}
      />

      {/* 구매확정은 배송완료 직후가 쓰는 자리라 스크롤 없이 닿는 위치에 둔다(서버 판정은 isConfirmable과 동일). */}
      {isConfirmable(order) && (
        <ConfirmSection
          dueAt={order.purchaseConfirmDueAt}
          loading={isConfirming}
          onClick={() => setConfirmTarget(order)}
        />
      )}

      <ClaimActionSection order={order} onRequest={goClaim} />

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

      {siblings.length > 0 && (
        <GroupOrdersCard
          orders={siblings}
          onSelect={siblingId =>
            navigate({ to: '/orders/$orderId', params: { orderId: siblingId } })
          }
        />
      )}

      {/* 형제 주문을 위 카드에 그렸으면 "주문 내역에서 볼 수 있어요"를 또 적지 않는다(같은 안내 두 번). */}
      <p className="text-caption text-text-tertiary">
        주문그룹 번호 <span className="tabular-nums">{order.orderGroupId}</span>
        {siblings.length === 0 && ' / 같은 결제의 다른 판매자 주문은 주문 내역에서 볼 수 있어요.'}
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

/**
 * 취소·반품·교환 요청 내역(GET /orders/{id}/claims) — 진행 중 건과 지난 건을 한 카드에 모은다.
 *
 * 내역이 아직 안 왔거나 실패했거나 **진행 중 건을 담고 있지 않으면 주문 상세 응답의 `activeClaim`을
 * 앞에 끼워 넣는다** — 그 한 건이 구매확정과 새 요청을 잠그는 근거이므로 어떤 경우에도 화면에 있어야
 * 한다(상세 응답에 늘 실려 오므로 이 폴백은 네트워크를 더 타지 않는다). 두 응답이 어긋날 리 없다고
 * 전제하면, 어긋나는 순간 사용자는 버튼이 잠긴 이유를 설명받지 못한다.
 *
 * 클레임이 한 건도 없는 것이 정상이라 그때는 카드를 그리지 않지만, 조회가 **실패**한 것은
 * "없음"과 구분해 한 줄로 알린다.
 */
function ClaimsCard({
  order,
  claims,
  isPending,
  isError,
  errorMessage,
  onRetry,
  onWithdraw,
  withdrawDisabled,
}: {
  order: BuyerOrderDetail
  claims: BuyerOrderClaim[]
  isPending: boolean
  isError: boolean
  errorMessage: string
  onRetry: () => void
  onWithdraw: (claim: BuyerOrderClaim) => void
  withdrawDisabled: boolean
}) {
  const listed = !isPending && !isError ? claims : []
  const active = order.activeClaim
  const rows =
    active && !listed.some(claim => claim.claimPublicId === active.claimPublicId)
      ? [active, ...listed]
      : listed

  if (rows.length === 0) {
    if (!isError) return null
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="min-w-0 text-caption text-text-secondary">{errorMessage}</p>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-caption font-semibold text-text-tertiary">취소/반품/교환 요청</p>
        {isError && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
      {isError && (
        <p className="text-caption text-text-tertiary">
          {errorMessage} 진행 중인 요청만 보여드려요.
        </p>
      )}
      {rows.map((claim, index) => (
        <div key={claim.claimPublicId} className="flex flex-col gap-1.5">
          {index > 0 && <Divider className="mb-1.5" />}
          <ClaimRow
            claim={claim}
            order={order}
            onWithdraw={onWithdraw}
            withdrawDisabled={withdrawDisabled}
          />
        </div>
      ))}
    </Card>
  )
}

/** 클레임 한 줄. 철회 버튼은 셀러 판단 전(CLAIM_REQUESTED)에만 — 그 뒤에는 서버가 409로 거절한다. */
function ClaimRow({
  claim,
  order,
  onWithdraw,
  withdrawDisabled,
}: {
  claim: BuyerOrderClaim
  order: BuyerOrderDetail
  onWithdraw: (claim: BuyerOrderClaim) => void
  withdrawDisabled: boolean
}) {
  const refund = claim.refundStatus ? CLAIM_REFUND_STATUS_LABEL[claim.refundStatus] : undefined
  const at = claimTimelineAt(claim)
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-label font-semibold text-text-primary">
          {CLAIM_TYPE_LABEL[claim.claimType]} 요청
        </p>
        <StatusPill variant={CLAIM_STATUS_VARIANT[claim.status]} size="sm">
          {CLAIM_STATUS_LABEL[claim.status]}
        </StatusPill>
      </div>

      {/* StatusPill 아래 보조 텍스트는 pill 내부 텍스트와 좌측을 맞춘다(디자인시스템 컨벤션). */}
      <p className="pl-0.5 text-caption text-text-secondary">{claimTargetSummary(claim, order)}</p>

      {claim.refundAmount != null && claim.refundAmount > 0 && (
        <PriceRow label="환불 금액" value={formatKRW(claim.refundAmount)} />
      )}
      {refund && <p className="pl-0.5 text-caption text-text-secondary">{refund}</p>}
      {claim.returnCostBearer && (
        <p className="pl-0.5 text-caption text-text-tertiary">
          {CLAIM_COST_BEARER_LABEL[claim.returnCostBearer]}
        </p>
      )}
      {claim.rejectionReason && (
        <p className="pl-0.5 text-caption text-text-secondary">
          거부 사유 / {claim.rejectionReason}
        </p>
      )}
      {at && <p className="pl-0.5 text-caption text-text-tertiary">{shortDateTime(at)}</p>}

      {claim.status === 'requested' && (
        <p className="pl-0.5 text-caption text-text-tertiary">
          진행 중에는 구매확정과 새 요청을 할 수 없어요.
        </p>
      )}

      {isWithdrawable(claim) && (
        <div className="mt-0.5 flex">
          <Button
            variant="secondary"
            size="sm"
            disabled={withdrawDisabled}
            onClick={() => onWithdraw(claim)}
          >
            요청 철회
          </Button>
        </div>
      )}
    </>
  )
}

/**
 * 클레임 요청 진입점. 서버가 받는 유형만 그린다(be `ClaimType.requestableFrom`) —
 * 취소는 발송 전, 반품·교환은 배송완료만. 구매확정 뒤에는 어느 유형도 받지 않아 아무 버튼도 없다.
 */
function ClaimActionSection({
  order,
  onRequest,
}: {
  order: BuyerOrderDetail
  onRequest: (type: BuyerClaimType) => void
}) {
  const cancelable = canRequestClaim(order, 'cancel')
  const returnable = canRequestClaim(order, 'return')
  const exchangeable = canRequestClaim(order, 'exchange')
  if (!cancelable && !returnable && !exchangeable) return null
  return (
    <div className="flex gap-2">
      {cancelable && (
        <Button variant="secondary" size="md" className="flex-1" onClick={() => onRequest('cancel')}>
          {CLAIM_ACTION_LABEL.cancel}
        </Button>
      )}
      {returnable && (
        <Button variant="secondary" size="md" className="flex-1" onClick={() => onRequest('return')}>
          {CLAIM_ACTION_LABEL.return}
        </Button>
      )}
      {exchangeable && (
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() => onRequest('exchange')}
        >
          {CLAIM_ACTION_LABEL.exchange}
        </Button>
      )}
    </div>
  )
}

/**
 * 같은 결제(주문그룹)의 다른 판매자 주문(GET /order-groups/{orderGroupId}).
 * 조회가 실패하면 이 카드를 그리지 않고, 그때는 아래 주문그룹 번호 줄이 "주문 내역에서 볼 수 있어요"로
 * 같은 길을 열어 준다 — 보조 카드 하나가 빠진 것을 오류로 알릴 이유가 없고 대체 경로가 화면에 남는다.
 */
function GroupOrdersCard({
  orders,
  onSelect,
}: {
  orders: BuyerSellerOrder[]
  onSelect: (orderId: string) => void
}) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <p className="text-caption font-semibold text-text-tertiary">같은 결제의 다른 주문</p>
      {orders.map(so => (
        <button
          key={so.orderId}
          type="button"
          onClick={() => onSelect(so.orderId)}
          className="flex items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm text-text-primary">
              {so.storeName ?? '판매자 정보 없음'}
            </span>
            <span className="mt-0.5 block text-caption text-text-tertiary">
              상품 {so.itemCount}개
            </span>
          </span>
          <StatusPill variant={ORDER_STATUS_VARIANT[so.status]} size="sm">
            {ORDER_STATUS_LABEL[so.status]}
          </StatusPill>
        </button>
      ))}
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

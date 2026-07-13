import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { BadgeCheck, CheckCircle2, Image as ImageIcon, RotateCcw, Truck } from 'lucide-react'
import type { BuyerOrder, BuyerOrderSellerGroup } from '@aechak/domain'
import {
  Alert,
  Button,
  EmptyState,
  MobileScreen,
  StatusPill,
  Timeline,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { useConfirmOrder, useOrder } from '../order.queries'
import { PAYMENT_METHOD_LABEL, buildOrderTimeline, shortDate } from '../order.mock'

// 주문 상세 / 배송 추적(b1-st-6). 배송 타임라인·자동 구매확정 안내·결제 정보 + 상태별 하단 액션.
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const order = useOrder(orderId)
  const confirmOrder = useConfirmOrder()
  const [toast, setToast] = useState<{ open: boolean; message: string }>({ open: false, message: '' })

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/orders' })
  }

  const writeReview = () => {
    const first = order?.groups[0]?.items[0]
    if (!first) return
    navigate({ to: '/reviews/write', search: { productId: first.productId, orderId } })
  }

  if (!order) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 상세" />}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="주문을 찾을 수 없어요"
            description="삭제되었거나 주소가 올바르지 않은 주문이에요."
            action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
          />
        </div>
      </MobileScreen>
    )
  }

  const cancelled = order.status === 'cancelled'
  const showAutoConfirm = order.status === 'delivered' && order.autoConfirmAt != null

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="주문 상세" />}
      footer={
        <DetailActionBar
          order={order}
          confirming={confirmOrder.isPending}
          onCancel={() => navigate({ to: '/orders/$orderId/cancel', params: { orderId } })}
          onConfirm={() =>
            confirmOrder.mutate(orderId, {
              onSuccess: () => setToast({ open: true, message: '구매를 확정했어요.' }),
            })
          }
          onWriteReview={writeReview}
        />
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {/* 주문번호 / 일시 */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-caption text-text-tertiary">주문번호</p>
            <p className="tabular-nums text-body-sm text-text-primary">{order.id}</p>
          </div>
          <p className="text-caption text-text-tertiary">{order.orderedAt}</p>
        </div>

        <StatusBanner order={order} />

        {cancelled ? (
          <RefundCard order={order} />
        ) : (
          <>
            {/* 배송 추적 타임라인 */}
            <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
              <Timeline steps={buildOrderTimeline(order)} />
            </div>

            {showAutoConfirm && (
              <Alert variant="info" title="상품이 도착했어요">
                {shortDate(order.autoConfirmAt)}에 자동으로 구매확정돼요. 상품을 확인한 뒤 구매확정을
                눌러 주세요.
              </Alert>
            )}
          </>
        )}

        {/* 주문 상품(셀러별) */}
        {order.groups.map(group => (
          <OrderItemsCard key={group.sellerId} group={group} />
        ))}

        {/* 결제 정보 */}
        <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
          <p className="mb-0.5 text-caption font-semibold text-text-tertiary">결제 정보</p>
          <PayRow label="상품 금액" value={formatKRW(order.itemsTotal)} />
          <PayRow
            label="배송비"
            value={order.shippingTotal === 0 ? '무료' : formatKRW(order.shippingTotal)}
            valueClass={order.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
          />
          {order.couponDiscount > 0 && (
            <PayRow label="쿠폰 할인" value={`-${formatKRW(order.couponDiscount)}`} valueClass="text-text-accent" />
          )}
          {order.pointsUsed > 0 && (
            <PayRow label="포인트 사용" value={`-${formatKRW(order.pointsUsed)}`} valueClass="text-text-accent" />
          )}
          <div className="my-0.5 h-px bg-border-subtle" />
          <div className="flex items-baseline justify-between">
            <span className="text-label font-bold text-text-primary">총 결제금액</span>
            <span className="text-price-sm font-bold text-text-price">{formatKRW(order.paidAmount)}</span>
          </div>
          {!cancelled && order.pointsEarned > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-caption text-text-tertiary">적립 예정 포인트</span>
              <span className="tabular-nums text-caption text-success-fg">
                +{order.pointsEarned.toLocaleString('ko-KR')}P
              </span>
            </div>
          )}
        </div>
      </div>

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant="info"
        aboveActionBar
      />
    </MobileScreen>
  )
}

function StatusBanner({ order }: { order: BuyerOrder }) {
  if (order.status === 'delivered') {
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
  if (order.status === 'shipping') {
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
  if (order.status === 'cancelled') {
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

function OrderItemsCard({ group }: { group: BuyerOrderSellerGroup }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
      <p className="mb-2.5 text-caption font-semibold text-text-tertiary">주문 상품 / {group.storeName}</p>
      <div className="flex flex-col gap-3">
        {group.items.map((item, i) => (
          <div key={`${item.productId}-${i}`} className="flex items-start gap-3">
            <div className="size-[52px] flex-none overflow-hidden rounded-image bg-surface-sunken">
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-icon-muted">
                  <ImageIcon className="size-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-body-sm text-text-primary">{item.name}</p>
              <p className="mt-0.5 text-caption text-text-tertiary">
                {item.option} / {item.quantity}개
              </p>
              <p className="mt-1 text-price-sm font-semibold text-text-price">
                {formatKRW(item.unitPrice * item.quantity)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RefundCard({ order }: { order: BuyerOrder }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <span className="text-label font-semibold text-text-secondary">환불 내역</span>
        <StatusPill variant="success" size="sm">
          <CheckCircle2 className="mr-0.5 inline size-3" />
          환불 완료
        </StatusPill>
      </div>
      <PayRow label="환불 금액" value={formatKRW(order.paidAmount)} />
      <PayRow label="환불 수단" value={PAYMENT_METHOD_LABEL[order.method]} />
      {order.refundedAt && <PayRow label="환불 완료일" value={shortDate(order.refundedAt) ?? ''} />}
      <p className="mt-1 text-caption text-text-tertiary">
        카드 환불은 카드사에 따라 영업일 기준 1~3일 더 걸릴 수 있어요.
      </p>
    </div>
  )
}

function PayRow({
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between text-body-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

function DetailActionBar({
  order,
  confirming,
  onCancel,
  onConfirm,
  onWriteReview,
}: {
  order: BuyerOrder
  confirming: boolean
  onCancel: () => void
  onConfirm: () => void
  onWriteReview: () => void
}) {
  const { status } = order
  // 배송중은 배송 추적 타임라인이 운송장/택배사를 이미 보여주므로 별도 액션 버튼을 두지 않는다.
  // 액션이 없는 상태(배송중/취소완료)에서는 빈 하단 바를 만들지 않도록 null을 반환한다.
  const hasAction =
    status === 'paid' || status === 'preparing' || status === 'delivered' || status === 'confirmed'
  if (!hasAction) return null

  return (
    <div
      className="flex items-center gap-2 border-t border-border-subtle bg-surface-raised px-4 pt-2.5"
      style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}
    >
      {(status === 'paid' || status === 'preparing') && (
        <Button variant="secondary" size="lg" onClick={onCancel} className="flex-1">
          주문 취소
        </Button>
      )}
      {status === 'delivered' && (
        <>
          <Button variant="secondary" size="lg" onClick={onConfirm} loading={confirming} className="flex-1">
            구매확정
          </Button>
          <Button variant="primary" size="lg" onClick={onWriteReview} className="flex-1">
            리뷰 쓰기
          </Button>
        </>
      )}
      {status === 'confirmed' && (
        <Button variant="primary" size="lg" onClick={onWriteReview} className="flex-1">
          리뷰 쓰기
        </Button>
      )}
    </div>
  )
}

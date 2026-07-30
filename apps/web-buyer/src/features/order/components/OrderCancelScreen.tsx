import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import type { BuyerOrder } from '@aechak/domain'
import {
  Alert,
  BottomFixedAction,
  EmptyState,
  MobileScreen,
  Modal,
  Radio,
  Textarea,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { useSafeBack } from '@/shared/useSafeBack'
import { useCancelOrder, useOrder } from '../order.queries'
import { CANCEL_REASONS, isCancelable } from '../order.mock'

// 주문 취소(b4-st-4). 배송 시작 전 주문만 취소 가능 — 배송중/완료 등은 취소 불가 안내를 보여준다.
export function OrderCancelScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const order = useOrder(orderId)
  const cancel = useCancelOrder()

  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [done, setDone] = useState(false)

  const goBack = useSafeBack({ to: '/orders/$orderId', params: { orderId } })

  if (!order) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 취소" />}>
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

  // 4-C 취소 완료 결과.
  if (done) {
    return (
      <MobileScreen
        footer={
          <BottomFixedAction
            primary={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders', replace: true }) }}
          />
        }
      >
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-surface text-success-fg">
            <CheckCircle2 className="size-10" />
          </span>
          <p className="text-title font-bold text-text-primary">취소가 완료됐어요</p>
          <p className="text-body-sm leading-relaxed text-text-secondary">
            환불 <strong className="text-text-primary">{formatKRW(order.paidAmount)}</strong>은 결제 수단으로
            영업일 2~3일 내 처리돼요.
          </p>
        </div>
      </MobileScreen>
    )
  }

  // 취소 불가(배송중/배송완료/구매확정/이미 취소됨).
  if (!isCancelable(order.status)) {
    const alreadyCancelled = order.status === 'cancelled'
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 취소" />}>
        <div className="flex flex-col gap-4 p-4">
          <Alert variant="warning" title={alreadyCancelled ? '이미 취소된 주문이에요' : '취소할 수 없는 주문이에요'}>
            {alreadyCancelled
              ? '이 주문은 이미 취소 처리됐어요.'
              : '이미 배송이 시작되어 주문 취소가 어려워요.'}
          </Alert>
          <button
            type="button"
            onClick={() => navigate({ to: '/orders/$orderId', params: { orderId } })}
            className="mx-auto text-body-sm text-text-link"
          >
            주문 상세로 돌아가기
          </button>
        </div>
      </MobileScreen>
    )
  }

  const selectedReason = CANCEL_REASONS.find(r => r.value === reason)
  const needsDetail = selectedReason?.needsDetail ?? false
  const canSubmit = reason !== '' && (!needsDetail || detail.trim().length > 0)

  const handleConfirm = () => {
    cancel.mutate(orderId, {
      onSuccess: () => {
        setConfirmOpen(false)
        setDone(true)
      },
    })
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="주문 취소" />}
      footer={
        <BottomFixedAction
          primary={{ label: '취소 신청', onClick: () => setConfirmOpen(true), disabled: !canSubmit }}
        />
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="info" title="배송 전이라 즉시 취소할 수 있어요">
          상품이 출고되면 취소할 수 없어요.
        </Alert>

        {/* 취소 사유 — 상품 신고 화면과 동일한 테두리 없는 촘촘한 행 디자인(gap-0.5 + min-h-10).
            라디오는 자체 label이라 바깥을 또 label로 감싸지 않고 div로만 감싼다. */}
        <div className="flex flex-col gap-2">
          <span className="mb-1 text-label font-semibold text-text-primary">취소 사유</span>
          <div className="flex flex-col gap-0.5">
            {CANCEL_REASONS.map(r => (
              <div key={r.value} className="flex min-h-10 items-center">
                <Radio
                  name="cancel-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  label={r.label}
                />
              </div>
            ))}
          </div>
          {needsDetail && (
            <Textarea
              value={detail}
              onChange={setDetail}
              maxLength={200}
              placeholder="취소 사유를 알려 주시면 서비스 개선에 도움이 돼요."
            />
          )}
        </div>

        <RefundSummary order={order} />
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="주문을 취소할까요?"
        description="취소하면 되돌릴 수 없어요. 적용했던 쿠폰은 복구되지 않을 수 있어요."
        confirmLabel="취소하기"
        cancelLabel="닫기"
        onConfirm={handleConfirm}
        loading={cancel.isPending}
      >
        <div className="flex items-center justify-between rounded-card bg-surface-sunken px-4 py-3">
          <span className="text-body-sm text-text-secondary">총 환불</span>
          <span className="text-price-sm font-bold text-text-price">{formatKRW(order.paidAmount)}</span>
        </div>
      </Modal>
    </MobileScreen>
  )
}

function RefundSummary({ order }: { order: BuyerOrder }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
      <span className="mb-0.5 text-label font-semibold text-text-primary">환불 예정 금액</span>
      <RefundRow label="상품 금액" value={formatKRW(order.itemsTotal)} />
      <RefundRow
        label="배송비"
        value={order.shippingTotal === 0 ? '무료' : formatKRW(order.shippingTotal)}
      />
      {order.pointsUsed > 0 && (
        <RefundRow label="적립금 사용" value={`-${formatKRW(order.pointsUsed)}`} valueClass="text-text-accent" />
      )}
      <div className="my-0.5 h-px bg-border-subtle" />
      <div className="flex items-baseline justify-between">
        <span className="text-label font-bold text-text-primary">총 환불</span>
        <span className="text-price-sm font-bold text-text-price">{formatKRW(order.paidAmount)}</span>
      </div>
      {order.pointsUsed > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-caption text-text-tertiary">적립금 복구</span>
          <span className="tabular-nums text-caption text-success-fg">
            +{order.pointsUsed.toLocaleString('ko-KR')}P
          </span>
        </div>
      )}
      <p className="mt-1 text-caption text-text-tertiary">카드 취소는 영업일 2~3일 내 처리돼요.</p>
    </div>
  )
}

function RefundRow({
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

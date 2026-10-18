import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { BuyerOrderDetail } from '@aechak/domain'
import {
  Alert,
  BottomFixedAction,
  Card,
  MobileScreen,
  Modal,
  Textarea,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { PriceRow } from '@/shared/components/PriceRow'
import { RadioList } from '@/shared/components/RadioList'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { formatKRW } from '@/shared/formatKRW'
import { useSafeBack } from '@/shared/useSafeBack'
import { useOrder } from '../order.queries'
import { CANCEL_REASONS, isCancelable } from '../order.mock'

// 주문 취소(b4-st-4). BE 취소 엔드포인트가 아직 없어 라우트(`routes/orders/$orderId/cancel.tsx`)가 상세로
// 되돌려 보내고 이 화면은 렌더되지 않는다 — 사유 폼·환불 요약 마크업만 보존하고, 목업 성공(상태 전이)은 없다.
export function OrderCancelScreen({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { order, isPending } = useOrder(orderId)

  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const goBack = useSafeBack({ to: '/orders/$orderId', params: { orderId } })

  if (isPending) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 취소" />}>
        <div className="p-4" aria-busy="true" />
      </MobileScreen>
    )
  }

  if (!order) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 취소" />}>
        <ScreenEmptyState
          title="주문을 찾을 수 없어요"
          description="삭제되었거나 주소가 올바르지 않은 주문이에요."
          action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
        />
      </MobileScreen>
    )
  }

  // 취소 불가(배송중/배송완료/구매확정/이미 취소됨).
  if (!isCancelable(order.status)) {
    const alreadyCancelled = order.status === 'cancelled'
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문 취소" />}>
        <div className="flex flex-col gap-4 p-4">
          <Alert
            variant="warning"
            title={alreadyCancelled ? '이미 취소된 주문이에요' : '취소할 수 없는 주문이에요'}
          >
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

  // 취소 API가 없어 확정해도 서버에 보내지 않는다 — 가짜 완료 대신 준비 중임을 알린다.
  const handleConfirm = () => {
    setConfirmOpen(false)
    setUnavailable(true)
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="주문 취소" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '취소 신청',
            onClick: () => setConfirmOpen(true),
            disabled: !canSubmit,
          }}
        />
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {unavailable ? (
          <Alert variant="warning" title="주문 취소는 준비 중이에요">
            아직 앱에서 취소를 접수할 수 없어요. 고객센터로 문의해 주세요.
          </Alert>
        ) : (
          <Alert variant="info" title="배송 전이라 즉시 취소할 수 있어요">
            상품이 출고되면 취소할 수 없어요.
          </Alert>
        )}

        {/* 취소 사유 — 상품 신고 화면과 같은 RadioList. */}
        <div className="flex flex-col gap-2">
          <span className="mb-1 text-label font-semibold text-text-primary">취소 사유</span>
          <RadioList
            name="cancel-reason"
            options={CANCEL_REASONS}
            value={reason}
            onChange={setReason}
          />
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
      >
        <div className="flex items-center justify-between rounded-card bg-surface-sunken px-4 py-3">
          <span className="text-body-sm text-text-secondary">총 환불</span>
          <span className="text-price-sm font-bold text-text-price">
            {formatKRW(refundTotal(order))}
          </span>
        </div>
      </Modal>
    </MobileScreen>
  )
}

// 이 셀러 주문의 상품 금액 + 배송비. 적립금·쿠폰은 주문그룹 전체 값이라 셀러 단위 환불액을 알 수 없어 뺀다.
function itemsSubtotal(order: BuyerOrderDetail): number {
  return order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
}

function refundTotal(order: BuyerOrderDetail): number {
  return itemsSubtotal(order) + order.sellerShippingFee
}

function RefundSummary({ order }: { order: BuyerOrderDetail }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="mb-0.5 text-label font-semibold text-text-primary">환불 예정 금액</span>
      <PriceRow label="상품 금액" value={formatKRW(itemsSubtotal(order))} />
      <PriceRow
        label="배송비"
        value={order.sellerShippingFee === 0 ? '무료' : formatKRW(order.sellerShippingFee)}
      />
      <Divider className="my-0.5" />
      <div className="flex items-baseline justify-between">
        <span className="text-label font-bold text-text-primary">총 환불</span>
        <span className="text-price-sm font-bold text-text-price">
          {formatKRW(refundTotal(order))}
        </span>
      </div>
      <p className="mt-1 text-caption text-text-tertiary">카드 취소는 영업일 2~3일 내 처리돼요.</p>
    </Card>
  )
}

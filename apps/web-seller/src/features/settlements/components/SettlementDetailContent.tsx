import { EmptyState, Skeleton, StatusPill } from '@aechak/design-system/web'
import type { SellerSettlementDetailData } from '@aechak/api'
import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
  formatDate,
  formatDateTime,
  formatDeduction,
  formatFeeRate,
  formatWon,
  settlementItemRows,
} from '../settlements.contract'

// 라벨 / 금액 한 행. deduction은 빨간 금액, total은 윗선 + 굵게(최종 정산 금액).
const TONE_CLASS = {
  plain: { row: 'py-1.5', label: 'text-body-sm text-text-secondary', value: 'text-text-primary' },
  deduction: { row: 'py-1.5', label: 'text-body-sm text-text-secondary', value: 'text-error-fg' },
  total: {
    row: 'mt-1 border-t border-border-subtle pt-2',
    label: 'font-semibold text-text-primary',
    value: 'font-semibold text-text-primary',
  },
} as const

function AmountRow({ label, value, tone = 'plain' }: { label: string; value: string; tone?: keyof typeof TONE_CLASS }) {
  const c = TONE_CLASS[tone]
  return (
    <div className={`flex items-center justify-between ${c.row}`}>
      <span className={c.label}>{label}</span>
      <span className={`tabular-nums ${c.value}`}>{value}</span>
    </div>
  )
}

interface SettlementDetailContentProps {
  orderId: string
  detail: SellerSettlementDetailData | undefined
  isPending: boolean
  isError: boolean
  errorMessage: string
  onRetry: () => void
}

export function SettlementDetailContent({
  orderId,
  detail,
  isPending,
  isError,
  errorMessage,
  onRetry,
}: SettlementDetailContentProps) {
  if (isError) {
    return (
      <EmptyState
        title="정산 상세를 불러오지 못했어요"
        description={errorMessage}
        action={{ label: '다시 시도', onClick: onRetry }}
      />
    )
  }

  if (isPending || !detail) {
    return (
      <div className="flex flex-col gap-2">
        <StatusPill variant="neutral">{orderId}</StatusPill>
        <Skeleton variant="rect" className="h-48" />
      </div>
    )
  }

  const rows = settlementItemRows(detail)

  return (
    <div>
      <div className="flex items-center gap-2">
        <StatusPill variant="neutral">{detail.orderId}</StatusPill>
        <StatusPill variant={SETTLEMENT_STATUS_VARIANT[detail.status]}>
          {SETTLEMENT_STATUS_LABEL[detail.status]}
        </StatusPill>
      </div>

      <div className="mt-3">
        <AmountRow label="상품 금액" value={formatWon(detail.productAmount)} />
        <AmountRow label="배송비" value={formatWon(detail.shippingFee)} />
        <AmountRow label="쿠폰 부담 금액 (셀러)" value={formatDeduction(detail.couponBurden)} tone="deduction" />
        {/* 요율은 정산 행에 박힌 생성 시점 스냅샷이다 — 화면이 8% / 2.8%를 하드코딩하지 않는다. */}
        <AmountRow
          label={`플랫폼 수수료 (${formatFeeRate(detail.platformFeeRate)})`}
          value={formatDeduction(detail.platformFeeAmount)}
          tone="deduction"
        />
        <AmountRow
          label={`PG 수수료 (${formatFeeRate(detail.pgFeeRate)})`}
          value={formatDeduction(detail.pgFeeAmount)}
          tone="deduction"
        />
        <AmountRow label="환불 차감 금액" value={formatDeduction(detail.refundDeduction)} tone="deduction" />
        <AmountRow label="최종 정산 금액" value={formatWon(detail.finalAmount)} tone="total" />
        <p className="mt-2 text-caption text-text-tertiary">
          구매확정일 {formatDateTime(detail.confirmedAt)} / 정산 예정일{' '}
          {formatDate(detail.expectedPayoutDate)}
        </p>
      </div>

      <div className="mt-5">
        <p className="text-label font-semibold text-text-primary">품목 내역</p>
        <p className="mt-1 text-caption text-text-tertiary">
          주문 하나가 목록의 한 행이고, 지급 예정액은 아래 품목 금액의 합이에요.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {rows.map(({ item, name, quantityLabel }) => (
            <div key={item.orderItemId} className="rounded-card border border-border-subtle p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{name}</p>
                <span className="flex-none text-caption tabular-nums text-text-tertiary">{quantityLabel}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                <AmountRow label="상품 금액" value={formatWon(item.grossAmount)} />
                <AmountRow label="배송비" value={formatWon(item.shippingFee)} />
                <AmountRow label="플랫폼 수수료" value={formatDeduction(item.commission)} tone="deduction" />
                <AmountRow label="PG 수수료" value={formatDeduction(item.pgFee)} tone="deduction" />
                <AmountRow label="쿠폰 부담" value={formatDeduction(item.sellerCouponBurden)} tone="deduction" />
                <AmountRow label="환불 차감" value={formatDeduction(item.refundDeduction)} tone="deduction" />
              </div>
              <AmountRow label="지급 예정액" value={formatWon(item.netAmount)} tone="total" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

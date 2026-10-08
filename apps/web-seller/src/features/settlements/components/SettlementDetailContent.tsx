import type { Settlement } from '@aechak/domain'
import { StatusPill } from '@aechak/design-system/web'

function formatWon(value: number): string {
  return `${value.toLocaleString()}원`
}

function formatDeduction(value?: number): string {
  if (value == null) return '-'
  return value > 0 ? `-${formatWon(value)}` : formatWon(value)
}

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
  settlement: Settlement
}

export function SettlementDetailContent({ settlement }: SettlementDetailContentProps) {
  const hasBreakdown = settlement.platformFeeAmount != null

  return (
    <div>
      <StatusPill variant="neutral">{settlement.orderId}</StatusPill>

      {!hasBreakdown ? (
        <p className="mt-3 text-body-sm text-text-tertiary">구매확정 전이라 상세 내역이 아직 없어요.</p>
      ) : (
        <div className="mt-3">
          <AmountRow label="상품 금액" value={formatWon(settlement.productAmount)} />
          <AmountRow label="배송비" value={formatWon(settlement.shippingFee ?? 0)} />
          <AmountRow label="쿠폰 부담 금액 (셀러)" value={formatDeduction(settlement.couponBurden)} tone="deduction" />
          <AmountRow label="플랫폼 수수료 (8%)" value={formatDeduction(settlement.platformFeeAmount)} tone="deduction" />
          <AmountRow label="PG 수수료 (2.8%)" value={formatDeduction(settlement.pgFeeAmount)} tone="deduction" />
          <AmountRow label="환불 차감 금액" value={formatDeduction(settlement.refundDeduction)} tone="deduction" />
          <AmountRow
            label="최종 정산 금액"
            value={settlement.finalAmount != null ? formatWon(settlement.finalAmount) : '-'}
            tone="total"
          />
          <p className="mt-2 text-caption text-text-tertiary">
            구매확정일 {settlement.confirmedAt ?? '-'} / 정산 예정일 {settlement.expectedPayoutDate ?? '-'}
          </p>
        </div>
      )}
    </div>
  )
}

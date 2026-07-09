import type { Settlement } from '@aechak/domain'
import { StatusPill } from '@aechak/design-system/web'

function formatWon(value: number): string {
  return `${value.toLocaleString()}원`
}

function formatDeduction(value?: number): string {
  if (value == null) return '-'
  return value > 0 ? `-${formatWon(value)}` : formatWon(value)
}

function DeductionRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="tabular-nums text-error-fg">{formatDeduction(value)}</span>
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
          <div className="flex items-center justify-between py-1.5">
            <span className="text-body-sm text-text-secondary">상품 금액</span>
            <span className="tabular-nums text-text-primary">{formatWon(settlement.productAmount)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-body-sm text-text-secondary">배송비</span>
            <span className="tabular-nums text-text-primary">{formatWon(settlement.shippingFee ?? 0)}</span>
          </div>
          <DeductionRow label="쿠폰 부담 금액 (셀러)" value={settlement.couponBurden} />
          <DeductionRow label="플랫폼 수수료 (8%)" value={settlement.platformFeeAmount} />
          <DeductionRow label="PG 수수료 (2.8%)" value={settlement.pgFeeAmount} />
          <DeductionRow label="환불 차감 금액" value={settlement.refundDeduction} />
          <div className="mt-1 flex items-center justify-between border-t border-border-subtle pt-2">
            <span className="font-semibold text-text-primary">최종 정산 금액</span>
            <span className="font-semibold tabular-nums text-text-primary">
              {settlement.finalAmount != null ? formatWon(settlement.finalAmount) : '-'}
            </span>
          </div>
          <p className="mt-2 text-caption text-text-tertiary">
            구매확정일 {settlement.confirmedAt ?? '-'} / 정산 예정일 {settlement.expectedPayoutDate ?? '-'}
          </p>
        </div>
      )}
    </div>
  )
}

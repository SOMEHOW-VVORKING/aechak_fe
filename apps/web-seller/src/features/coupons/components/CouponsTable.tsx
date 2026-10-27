import { DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import {
  COUPON_STATUS_LABEL,
  COUPON_STATUS_VARIANT,
  couponDiscountText,
  couponIssueText,
  type SampleCoupon,
} from '../coupons.mock'

// 상품 관리·클레임 화면과 같은 표 패턴(DataTable + TwoLineCell + StatusPill).
export function CouponsTable({ coupons }: { coupons: SampleCoupon[] }) {
  const columns: Column<SampleCoupon>[] = [
    {
      key: 'name',
      label: '쿠폰명 / 쿠폰번호',
      render: coupon => <TwoLineCell primary={coupon.name} secondary={coupon.couponPublicId} />,
    },
    {
      key: 'discount',
      label: '할인 / 사용 조건',
      render: coupon => (
        <div>
          <p className="text-body-sm text-text-primary">{couponDiscountText(coupon)}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {coupon.minOrderAmount.toLocaleString()}원 이상 구매
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      label: '사용 기간',
      render: coupon => (
        <span className="tabular-nums text-body-sm text-text-secondary">
          {coupon.startAt} ~ {coupon.endAt}
        </span>
      ),
    },
    {
      key: 'issued',
      label: '발급 / 사용',
      align: 'right',
      render: coupon => (
        <div>
          <p className="tabular-nums text-body-sm text-text-primary">{couponIssueText(coupon)}</p>
          <p className="mt-0.5 tabular-nums text-caption text-text-tertiary">
            사용 {coupon.usedCount.toLocaleString()}건
          </p>
        </div>
      ),
    },
    {
      key: 'burden',
      label: '셀러 부담액',
      align: 'right',
      render: coupon => (
        <span className="tabular-nums">{coupon.sellerBurden.toLocaleString()}원</span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: coupon => (
        <StatusPill variant={COUPON_STATUS_VARIANT[coupon.status]}>
          {COUPON_STATUS_LABEL[coupon.status]}
        </StatusPill>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={coupons}
      rowKey={coupon => coupon.couponPublicId}
      emptyLabel="조건에 맞는 쿠폰이 없어요."
    />
  )
}

import { Button, DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import {
  COUPON_STATUS_LABEL,
  COUPON_STATUS_VARIANT,
  canStopCoupon,
  couponDiscountText,
  couponIssueText,
  type SampleCoupon,
} from '../coupons.mock'

interface CouponsTableProps {
  coupons: SampleCoupon[]
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onStop: (couponPublicId: string) => void
}

// 상품 관리·클레임 화면과 같은 표 패턴(DataTable + TwoLineCell + StatusPill + 액션 컬럼).
export function CouponsTable({ coupons, onStop }: CouponsTableProps) {
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
      // tabular-nums 날짜 컬럼은 right(AGENTS 4절 — align이 없으면 회귀 신호).
      align: 'right',
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
      // 보조텍스트 없는 StatusPill 단독 컬럼은 center(AGENTS 4절).
      align: 'center',
      render: coupon => (
        <StatusPill variant={COUPON_STATUS_VARIANT[coupon.status]}>
          {COUPON_STATUS_LABEL[coupon.status]}
        </StatusPill>
      ),
    },
    {
      // 발급을 멈추는 일은 쿠폰 관리의 핵심 동작이라 모양을 보여 준다 — 표가 상태만 보여주고
      // 끝나면 "발급 중 쿠폰을 어떻게 멈추는가"를 운영자가 화면에서 알 수 없다(교차검토 지적).
      // 끝난/중단된 쿠폰에는 버튼 자체를 그리지 않는다(비활성 버튼은 권한 문제로 읽힌다).
      key: 'actions',
      label: '처리',
      render: coupon =>
        canStopCoupon(coupon) ? (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${coupon.name} 발급 중단`}
              onClick={() => onStop(coupon.couponPublicId)}
            >
              발급 중단
            </Button>
          </div>
        ) : null,
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

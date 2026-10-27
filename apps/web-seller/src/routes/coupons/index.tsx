import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Button,
  FilterBar,
  MetricCard,
  PageHeader,
  Select,
  StatusPill,
} from '@aechak/design-system/web'
import {
  COUPON_STATUS_LABEL,
  CouponCreateForm,
  CouponsTable,
  SAMPLE_COUPONS,
  type CouponStatus,
} from '@/features/coupons'
import { SAMPLE_ACTION_TOAST, SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/coupons/')({
  component: CouponsRoute,
})

/**
 * 혜택/쿠폰/할인 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307에서 **안내만 있던 화면을 예시 데이터로 채웠다**(`UnavailableScreen` → 발급 현황 표 +
 * 쿠폰 생성 폼). 지운 것은 없고, 저장되지 않는다는 사실은 상단 `SampleDataNotice` 띠가 말한다.
 * "상품 관리로" 안내 버튼은 그대로 남긴다 — 상품별 할인가는 지금도 그 폼에서 **실제로** 저장된다.
 *
 * 예시 데이터와 BE가 생겼을 때의 교체 방법은 `features/coupons/coupons.mock.ts` 머리에 있다.
 */

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  ...(Object.entries(COUPON_STATUS_LABEL) as [CouponStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
]

function CouponsRoute() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<CouponStatus | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  const toast = useToast()

  // 필터는 예시 배열에 실제로 적용한다 — 눌러도 아무 일 없는 컨트롤은 장식 UI다(AGENTS.md 2절).
  const rows = useMemo(
    () => SAMPLE_COUPONS.filter(coupon => status === '' || coupon.status === status),
    [status],
  )

  const activeCount = SAMPLE_COUPONS.filter(coupon => coupon.status === 'ACTIVE').length
  const issuedTotal = SAMPLE_COUPONS.reduce((sum, coupon) => sum + coupon.issuedCount, 0)
  const usedTotal = SAMPLE_COUPONS.reduce((sum, coupon) => sum + coupon.usedCount, 0)
  const burdenTotal = SAMPLE_COUPONS.reduce((sum, coupon) => sum + coupon.sellerBurden, 0)

  return (
    <div className="p-6">
      <PageHeader
        title="혜택/쿠폰/할인"
        actions={
          <>
            <StatusPill variant="muted">준비 중</StatusPill>
            <Button variant="secondary" size="md" onClick={() => void navigate({ to: '/products' })}>
              상품 관리로
            </Button>
            <Button variant="primary" size="md" onClick={() => setFormOpen(open => !open)}>
              {formOpen ? '만들기 닫기' : '쿠폰 만들기'}
            </Button>
          </>
        }
      />

      <SampleDataNotice
        replaceWhen={
          <>
            seller 호스트에 <strong>GET /sellers/me/coupons</strong>와 생성 경로가 생기면 실제 쿠폰으로
            바뀌어요. 상품 하나하나의 할인가는 지금도 상품 관리의 등록/수정 폼에서 저장돼요.
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="발급 중 쿠폰" value={`${activeCount}개`} />
        <MetricCard label="총 발급" value={`${issuedTotal.toLocaleString()}장`} />
        <MetricCard label="총 사용" value={`${usedTotal.toLocaleString()}장`} />
        <MetricCard
          label="셀러 부담액 누계"
          value={`${burdenTotal.toLocaleString()}원`}
          variant="quiet"
          footer={<span className="text-caption text-text-tertiary">정산 내역의 쿠폰 부담액과 맞춰 봐요</span>}
        />
      </div>

      {formOpen && (
        <CouponCreateForm
          onCancel={() => setFormOpen(false)}
          onSubmit={() => {
            setFormOpen(false)
            toast.show(SAMPLE_ACTION_TOAST, 'info')
          }}
        />
      )}

      <FilterBar>
        <Select
          aria-label="쿠폰 상태"
          options={STATUS_OPTIONS}
          value={status}
          onChange={value => setStatus(value as CouponStatus | '')}
        />
        <Button variant="ghost" size="md" onClick={() => setStatus('')}>
          초기화
        </Button>
      </FilterBar>

      <p className="mt-4 text-caption text-text-tertiary">총 {rows.length}개</p>

      <div className="mt-2">
        <CouponsTable coupons={rows} onStop={() => toast.show(SAMPLE_ACTION_TOAST, 'info')} />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        셀러 부담액은 쿠폰 할인 중 내가 낸 몫이에요. 플랫폼이 분담한 몫은 정산 명세에서 따로 봐요.
      </p>

      {toast.element}
    </div>
  )
}

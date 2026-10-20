import { Link } from '@tanstack/react-router'
import { Card } from '@aechak/design-system/web'
import { courierNameOf, useCouriers } from '@/shared/couriers'
import { useShippingPolicy } from '../shipping-policy.queries'

// 상품 등록/수정 폼의 배송 정책 칸. 계약상 배송 정책은 셀러 단위(CRQ-SLR-04)라 상품 본문에 싣지
// 않고 읽기 전용 요약 + 수정 링크만 둔다. 새 탭으로 열어 작성 중인 상품 폼을 잃지 않게 한다.
export function ShippingPolicySummary() {
  const { data } = useShippingPolicy()
  const couriers = useCouriers()
  if (!data) return null
  // 서버 마스터에 없는 코드(또는 조회 실패)면 코드를 그대로 보여 준다 — 라벨을 지어내지 않는다.
  const courier = courierNameOf(couriers.data, data.defaultCourier)
  return (
    <Card padding="md">
      <p className="text-body-sm font-medium text-text-primary">
        {courier} / 기본 배송비 {data.baseFee.toLocaleString()}원 / {data.freeShippingThreshold.toLocaleString()}원
        이상 무료배송
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-caption text-text-tertiary">배송 정책은 스토어 전체 상품에 함께 적용돼요.</p>
        <Link to="/shipping-policy" target="_blank" className="text-label font-semibold text-brand">
          배송 정책 수정
        </Link>
      </div>
    </Card>
  )
}

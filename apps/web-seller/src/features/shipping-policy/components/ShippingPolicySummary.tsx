import { Link } from '@tanstack/react-router'
import { Card, Skeleton } from '@aechak/design-system/web'
import { courierNameOf, useCouriers } from '@/shared/couriers'
import { useShippingPolicy } from '../shipping-policy.queries'

// 상품 등록/수정 폼의 배송 정책 칸. 계약상 배송 정책은 셀러 단위(CRQ-SLR-04)라 상품 본문에 싣지
// 않고 읽기 전용 요약 + 수정 링크만 둔다. 새 탭으로 열어 작성 중인 상품 폼을 잃지 않게 한다.

const won = (value: number) => `${value.toLocaleString()}원`

export function ShippingPolicySummary() {
  const { data, isPending, isError } = useShippingPolicy()
  const couriers = useCouriers()

  if (isPending) {
    return (
      <Card padding="md">
        <Skeleton variant="text" className="w-72" />
      </Card>
    )
  }

  // 실패를 빈 자리로 떨구지 않는다 — 정책이 없는 것과 못 읽은 것은 다르다.
  if (isError || !data) {
    return (
      <Card padding="md">
        <p className="text-body-sm font-medium text-text-primary">배송 정책을 불러오지 못했어요</p>
        <p className="mt-1 text-caption text-text-tertiary">
          상품 등록에는 영향이 없어요. 배송 정책은 스토어 전체 상품에 함께 적용돼요.
        </p>
      </Card>
    )
  }

  // 서버 마스터에 없는 코드(또는 조회 실패)면 코드를 그대로 보여 준다 — 라벨을 지어내지 않는다.
  const courier =
    data.defaultCourierCode == null
      ? '기본 택배사 미설정'
      : courierNameOf(couriers.data, data.defaultCourierCode)
  const freeShipping =
    data.freeShippingThreshold == null
      ? '무료배송 미운영'
      : `${won(data.freeShippingThreshold)} 이상 무료배송`

  return (
    <Card padding="md">
      <p className="text-body-sm font-medium text-text-primary">
        {courier} / 기본 배송비 {won(data.baseShippingFee)} / {freeShipping}
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

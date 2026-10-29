import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/coupons/')({
  component: CouponsRoute,
})

/**
 * 셀러 nav에는 "혜택/쿠폰/할인"이 처음부터 있었지만 라우트 파일은 한 번도
 * 만들어진 적이 없어 메뉴만 되살리면 404로 갔다 — 자리를 만들고 안내를 둔다.
 *
 * BE 실측(2026-10-26, dev 스펙 전수): seller 스펙에 쿠폰이라는 말이 들어간 필드는 있지만 전부
 * 다른 화면 소속이다 — `discountPrice`/`discountStartAt`/`discountEndAt`는 상품 등록·수정 폼
 * 필드고(그래서 상품별 할인가는 지금도 설정된다), `couponBurden`/`allocatedCouponDiscount`는
 * 정산·주문 응답의 읽기 전용 금액이다. **쿠폰을 만들고 발급하는 경로는 없다.**
 */
function CouponsRoute() {
  const navigate = useNavigate()

  return (
    <UnavailableScreen
      title="혜택/쿠폰/할인"
      message="혜택/쿠폰/할인은 준비 중이에요"
      description="쿠폰을 만들어 발급하고 할인 행사를 관리하는 화면이에요. 상품 하나하나의 할인가는 지금도 상품 관리의 등록/수정 폼에서 설정할 수 있어요."
      action={{ label: '상품 관리로', onClick: () => void navigate({ to: '/products' }) }}
      upcoming={[
        {
          label: '쿠폰 만들기',
          description: '할인율/정액 쿠폰을 만들고 최소 주문금액, 사용 기간, 발급 수량을 정해요.',
        },
        {
          label: '발급 현황',
          description: '쿠폰별 발급 수와 사용 수, 남은 수량을 봐요.',
        },
        {
          label: '할인 행사',
          description: '여러 상품을 묶어 기간 할인을 걸고 끝나면 원래 가격으로 돌려요.',
        },
        {
          label: '비용 분담',
          description: '쿠폰 할인액 중 셀러가 부담한 금액을 정산 내역과 맞춰 봐요.',
        },
      ]}
    />
  )
}

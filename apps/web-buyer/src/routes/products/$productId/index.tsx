import { createFileRoute } from '@tanstack/react-router'
import { ProductDetailScreen } from '@/features/product'
import { ProductInquirySection } from '@/features/product-inquiry'
import { restoreSessionOrGuest } from '@/shared/auth'

// 상품 상세는 비로그인도 본다(상세 자체가 permitAll). 그런데 같은 화면의 문의 목록과 리뷰
// 미리보기는 JWT 필수라, **진짜 비회원인지 먼저 확정해야 한다** — `auth.store`의 loggedIn은
// 기본값이 true인 세션 mock이라 새로고침·공유 링크로 들어온 비회원도 "로그인됨"으로 읽히고,
// 그 상태로 회원 전용 조회를 보내면 401 → refresh 실패 → 전역 리다이렉트로 **보고 있던 상세를
// 잃는다**(dev 배포에서 실측했다). 세션을 먼저 복원하고 못 하면 비로그인으로 이어 가면
// 화면의 로그인 안내가 제대로 뜬다 — SNS 프로필 라우트와 같은 판단이다.
export const Route = createFileRoute('/products/$productId/')({
  beforeLoad: restoreSessionOrGuest,
  component: ProductDetailRoute,
})

function ProductDetailRoute() {
  const { productId } = Route.useParams()
  // 문의 영역은 별도 feature라 상세 화면이 직접 import할 수 없다(feature 간 import 금지) —
  // 라우트가 조립해 슬롯으로 내려 준다.
  return (
    <ProductDetailScreen
      productId={productId}
      inquirySlot={<ProductInquirySection productId={productId} />}
    />
  )
}

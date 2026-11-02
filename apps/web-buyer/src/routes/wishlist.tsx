import { createFileRoute } from '@tanstack/react-router'
import { WishlistScreen } from '@/features/wishlist'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// full-bleed(탭바 없음) — 뒤로가기 앱바로 진입 화면으로 복귀한다.
export const Route = createFileRoute('/wishlist')({
  component: WishlistRoute,
})

// 찜 목록은 회원 전용(GET /users/me/liked-products 비로그인 401)이다. 비회원으로 확정된 경우에만
// 로그인 안내를 그린다 — 'unknown'(세션 확인 실패)은 화면에 맡겨 조회 실패를 그대로 보이게 한다.
function WishlistRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="wish" />
  return <WishlistScreen />
}

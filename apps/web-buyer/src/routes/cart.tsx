import { createFileRoute } from '@tanstack/react-router'
import { CartScreen } from '@/features/cart'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// full-bleed(탭바 없음) — 뒤로가기 앱바로 진입 화면으로 복귀한다.
export const Route = createFileRoute('/cart')({
  component: CartRoute,
})

// 장바구니는 회원 전용(GET /carts 비로그인 401)이다. 판정 근거는 /wishlist와 같다.
function CartRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="cart" />
  return <CartScreen />
}

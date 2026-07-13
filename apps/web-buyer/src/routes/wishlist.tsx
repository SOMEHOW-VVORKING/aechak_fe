import { createFileRoute } from '@tanstack/react-router'
import { WishlistScreen } from '@/features/wishlist'

// full-bleed(탭바 없음) — 뒤로가기 앱바로 진입 화면으로 복귀한다.
export const Route = createFileRoute('/wishlist')({
  component: WishlistScreen,
})

import { useCartItems } from '@/shared/cart'
import { buildCartView, type CartView } from '@/shared/catalog'

// 장바구니 뷰 셀렉터 훅. 장바구니는 서버 상태가 아니라 클라이언트 스토어 파생값이라(찜 목록과 동일)
// TanStack Query가 아니라 스토어 구독 훅으로 둔다. 라인 원본(shared/cart)을 buildCartView
// (shared/catalog)로 해석해 셀러 그룹·금액·배송비까지 계산한 뷰를 돌려준다.
export function useCartView(): CartView {
  return buildCartView(useCartItems())
}

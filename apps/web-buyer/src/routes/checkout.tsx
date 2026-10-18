import { createFileRoute, redirect } from '@tanstack/react-router'
import { CheckoutScreen } from '@/features/checkout'

// 주문서는 장바구니 선택 항목으로만 진입한다. 옛 바로구매 search(?buyNow=…)는 받되 beforeLoad에서
// 장바구니로 돌려보낸다 — BE 주문 생성이 장바구니 행 id만 받아 합성 주문을 만들 수 없다.
export const Route = createFileRoute('/checkout')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { buyNow?: string; option?: string; qty?: number; addl?: number } => ({
    buyNow: typeof search.buyNow === 'string' ? search.buyNow : undefined,
    option: typeof search.option === 'string' ? search.option : undefined,
    qty:
      typeof search.qty === 'number'
        ? search.qty
        : typeof search.qty === 'string' && search.qty !== ''
          ? Number(search.qty) || undefined
          : undefined,
    addl:
      typeof search.addl === 'number'
        ? search.addl
        : typeof search.addl === 'string' && search.addl !== ''
          ? Number(search.addl) || undefined
          : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.buyNow) throw redirect({ to: '/cart', replace: true })
  },
  component: CheckoutRoute,
})

function CheckoutRoute() {
  return <CheckoutScreen />
}

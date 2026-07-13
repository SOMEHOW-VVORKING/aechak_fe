import { createFileRoute } from '@tanstack/react-router'
import { CheckoutScreen } from '@/features/checkout'

// ?buyNow=<productId>&option=<옵션>&qty=<수량> — 상품 상세 "바로 구매"로 진입 시 단일 상품 주문.
// 파라미터가 없으면 장바구니의 선택 항목으로 주문한다.
export const Route = createFileRoute('/checkout')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { buyNow?: string; option?: string; qty?: number } => ({
    buyNow: typeof search.buyNow === 'string' ? search.buyNow : undefined,
    option: typeof search.option === 'string' ? search.option : undefined,
    qty:
      typeof search.qty === 'number'
        ? search.qty
        : typeof search.qty === 'string' && search.qty !== ''
          ? Number(search.qty) || undefined
          : undefined,
  }),
  component: CheckoutRoute,
})

function CheckoutRoute() {
  const { buyNow, option, qty } = Route.useSearch()
  return <CheckoutScreen buyNow={buyNow} option={option} qty={qty} />
}

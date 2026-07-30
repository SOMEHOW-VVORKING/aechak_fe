import { createFileRoute, redirect } from '@tanstack/react-router'
import type { PaymentMethod } from '@aechak/domain'
import { PaymentResultScreen } from '@/features/payment'

const METHODS: PaymentMethod[] = ['kakaopay', 'tosspay', 'card']

export interface PaymentResultSearch {
  amount: number
  method: PaymentMethod
  source: 'cart' | 'buynow'
  // 바로구매 컨텍스트(source==='buynow') / 장바구니 주문 라인 키(source==='cart').
  buyNow?: string
  option?: string
  qty?: number
  /** 바로구매 옵션 조합 추가금(원) — 주문 스냅샷 단가에 반영. */
  addl?: number
  orderedKeys?: string[]
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? undefined : n
  }
  return undefined
}

// 유효한 주문 세션인지 결정적으로 판정한다: 결제금액이 있고(>0), 소스별 필수 컨텍스트가 있어야 한다.
// (바로구매=상품 id, 장바구니=주문된 라인 키). 직접 URL 진입 등으로 이 조건을 못 채우면 가짜 결제를
// 발화시키지 않고 /cart로 되돌린다(장바구니도 건드리지 않음).
function hasValidOrder(search: PaymentResultSearch): boolean {
  if (search.amount <= 0) return false
  return search.source === 'buynow'
    ? typeof search.buyNow === 'string' && search.buyNow !== ''
    : (search.orderedKeys?.length ?? 0) > 0
}

// ?amount=&method=&source=cart|buynow (+ buyNow/option/qty 또는 orderedKeys) — 주문서에서 넘어온 결제 세션.
export const Route = createFileRoute('/payment/result')({
  validateSearch: (search: Record<string, unknown>): PaymentResultSearch => ({
    amount: toNumber(search.amount) ?? 0,
    method: METHODS.includes(search.method as PaymentMethod)
      ? (search.method as PaymentMethod)
      : 'kakaopay',
    source: search.source === 'buynow' ? 'buynow' : 'cart',
    buyNow: typeof search.buyNow === 'string' ? search.buyNow : undefined,
    option: typeof search.option === 'string' ? search.option : undefined,
    qty: toNumber(search.qty),
    addl: toNumber(search.addl),
    orderedKeys: Array.isArray(search.orderedKeys)
      ? search.orderedKeys.filter((k): k is string => typeof k === 'string')
      : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (!hasValidOrder(search)) throw redirect({ to: '/cart' })
  },
  component: PaymentResultRoute,
})

function PaymentResultRoute() {
  const { amount, method, source, buyNow, option, qty, addl, orderedKeys } = Route.useSearch()
  return (
    <PaymentResultScreen
      amount={amount}
      method={method}
      source={source}
      buyNow={buyNow}
      option={option}
      qty={qty}
      addl={addl}
      orderedKeys={orderedKeys}
    />
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'
import type { PaymentMethod } from '@aechak/domain'
import { PaymentResultScreen } from '@/features/payment'

const METHODS: PaymentMethod[] = ['kakaopay', 'tosspay', 'card']

export interface PaymentResultSearch {
  orderGroupId: string
  method?: PaymentMethod
}

// ?orderGroupId=<ULID>&method=kakaopay|tosspay|card — 주문서가 결제창을 닫은 뒤 넘어오거나,
// 포트원 redirect 복귀로 들어온다. 복귀 시 붙는 paymentId·code·message 쿼리는 서버 complete가
// 결제 성공의 기준이라 읽지 않는다(있어도 깨지지 않게 느슨하게 파싱).
export const Route = createFileRoute('/payment/result')({
  validateSearch: (search: Record<string, unknown>): PaymentResultSearch => ({
    orderGroupId: typeof search.orderGroupId === 'string' ? search.orderGroupId.trim() : '',
    method: METHODS.includes(search.method as PaymentMethod)
      ? (search.method as PaymentMethod)
      : undefined,
  }),
  beforeLoad: ({ search }) => {
    // 주문그룹 없이 진입하면 complete를 부르지 않고 장바구니로 되돌린다.
    if (!search.orderGroupId) throw redirect({ to: '/cart' })
  },
  component: PaymentResultRoute,
})

function PaymentResultRoute() {
  const { orderGroupId, method } = Route.useSearch()
  return <PaymentResultScreen key={orderGroupId} orderGroupId={orderGroupId} method={method} />
}

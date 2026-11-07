import { createFileRoute, redirect } from '@tanstack/react-router'
import type { BuyerClaimType } from '@aechak/domain'
import { OrderClaimRequestScreen } from '@/features/order'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

export interface OrderClaimSearch {
  /** 모르는 값·누락은 undefined로 접고 `beforeLoad`가 주문 상세로 되돌린다. */
  type?: BuyerClaimType
}

const CLAIM_TYPES: readonly BuyerClaimType[] = ['cancel', 'return', 'exchange']

const claimType = (value: unknown): BuyerClaimType | undefined =>
  CLAIM_TYPES.find(type => type === value)

// 클레임(취소·반품·교환) 요청. 세 유형이 사유 선택지와 안내 문구만 다르고 흐름이 같아
// 한 라우트에 유형을 싣는다. 유형을 모르면 폼을 그릴 수 없으므로 빈 화면 대신 상세로 되돌린다.
export const Route = createFileRoute('/orders/$orderId/claim')({
  validateSearch: (search: Record<string, unknown>): OrderClaimSearch => {
    const type = claimType(search.type)
    return type ? { type } : {}
  },
  beforeLoad: ({ params, search }) => {
    if (search.type == null) {
      throw redirect({ to: '/orders/$orderId', params: { orderId: params.orderId }, replace: true })
    }
  },
  component: OrderClaimRoute,
})

function OrderClaimRoute() {
  const { orderId } = Route.useParams()
  const { type } = Route.useSearch()
  const session = useSessionState()
  if (session === 'guest') return <AuthRequiredScreen feature="order" />
  // beforeLoad가 유형 없는 진입을 막아 여기서는 늘 값이 있다 — 그래도 타입을 좁혀 둔다.
  if (type == null) return null
  return <OrderClaimRequestScreen orderId={orderId} claimType={type} />
}

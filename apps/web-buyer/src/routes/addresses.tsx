import { createFileRoute } from '@tanstack/react-router'
import { DeliveryAddressBookScreen } from '@/features/delivery-address'

// ?from=checkout — 주문서에서 진입 시 뒤로가기가 주문서로 복귀한다.
export const Route = createFileRoute('/addresses')({
  validateSearch: (search: Record<string, unknown>): { from?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  component: AddressesRoute,
})

function AddressesRoute() {
  const { from } = Route.useSearch()
  return <DeliveryAddressBookScreen from={from} />
}

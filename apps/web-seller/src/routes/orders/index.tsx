import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Order } from '@aechak/domain'
import { FilterBar, FilterChipGroup, PageHeader, SearchInput } from '@aechak/design-system/web'
import { OrdersTable, ShipmentModal, useOrders } from '@/features/orders'

export const Route = createFileRoute('/orders/')({
  component: OrdersRoute,
})

type StatusFilter = 'all' | Order['status']

function OrdersRoute() {
  const { data: orders = [], isLoading, isError, refetch } = useOrders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>(['all'])
  const [shipmentOrder, setShipmentOrder] = useState<Order | null>(null)

  const activeFilter = statusFilter[0] ?? 'all'

  const filterOptions = useMemo(
    () => [
      { value: 'all' as const, label: `전체 ${orders.length}` },
      { value: 'new_order' as const, label: `신규 주문 ${orders.filter(o => o.status === 'new_order').length}` },
      { value: 'preparing' as const, label: `발송 대기 ${orders.filter(o => o.status === 'preparing').length}` },
      { value: 'shipping' as const, label: `배송중 ${orders.filter(o => o.status === 'shipping').length}` },
      { value: 'delivered' as const, label: `구매확정 대기 ${orders.filter(o => o.status === 'delivered').length}` },
    ],
    [orders],
  )

  const filtered = useMemo(
    () =>
      orders.filter(o => {
        if (activeFilter !== 'all' && o.status !== activeFilter) return false
        if (search && !o.id.includes(search) && !o.recipientName.includes(search)) return false
        return true
      }),
    [orders, activeFilter, search],
  )

  return (
    <div className="p-6">
      <PageHeader title="주문/배송 관리" />

      <FilterBar className="mb-4">
        <FilterChipGroup
          options={filterOptions}
          value={statusFilter}
          onChange={next => setStatusFilter(next.length ? [next[next.length - 1] as StatusFilter] : ['all'])}
        />
        <div className="grow" />
        <SearchInput value={search} onChange={setSearch} placeholder="주문번호 / 수령자명" className="w-56" />
      </FilterBar>

      <OrdersTable
        orders={filtered}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onShip={setShipmentOrder}
      />

      <ShipmentModal order={shipmentOrder} onClose={() => setShipmentOrder(null)} />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Settlement, SettlementStatus } from '@aechak/domain'
import { DataTable, Drawer, PageHeader, Select, StatusPill, type Column, type StatusPillVariant } from '@aechak/design-system/web'
import { SETTLEMENT_STATUS_LABEL, SettlementDetailContent, useSettlements } from '@/features/settlements'

export const Route = createFileRoute('/settlements/')({
  component: SettlementsRoute,
})

const STATUS_VARIANT: Record<SettlementStatus, StatusPillVariant> = {
  pending: 'neutral',
  scheduled: 'info',
  completed: 'success',
  held: 'warning',
}

const MONTH_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: '2026-06', label: '2026.06' },
  { value: '2026-05', label: '2026.05' },
  { value: '2026-04', label: '2026.04' },
]

const columns: Column<Settlement>[] = [
  {
    key: 'orderId',
    label: '주문번호',
    render: s => <span className="font-semibold tabular-nums">{s.orderId}</span>,
  },
  {
    key: 'confirmedAt',
    label: '구매확정일',
    align: 'right',
    render: s => <span className="tabular-nums">{s.confirmedAt ?? '-'}</span>,
  },
  {
    key: 'expectedPayoutDate',
    label: '정산예정일',
    align: 'right',
    render: s => <span className="tabular-nums">{s.expectedPayoutDate ?? '-'}</span>,
  },
  {
    key: 'productAmount',
    label: '상품금액',
    align: 'right',
    render: s => <span className="tabular-nums">{s.productAmount.toLocaleString()}원</span>,
  },
  {
    key: 'feeAmount',
    label: '수수료',
    align: 'right',
    render: s => (
      <span className="tabular-nums">{s.feeAmount != null ? `-${s.feeAmount.toLocaleString()}원` : '-'}</span>
    ),
  },
  {
    key: 'finalAmount',
    label: '최종정산금액',
    align: 'right',
    render: s => (
      <span className="font-semibold tabular-nums">
        {s.finalAmount != null ? `${s.finalAmount.toLocaleString()}원` : '-'}
      </span>
    ),
  },
  {
    key: 'status',
    label: '상태',
    align: 'center',
    render: s => <StatusPill variant={STATUS_VARIANT[s.status]}>{SETTLEMENT_STATUS_LABEL[s.status]}</StatusPill>,
  },
]

function SettlementsRoute() {
  const { data: settlements = [], isLoading } = useSettlements()
  const [month, setMonth] = useState('all')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const filtered = useMemo(
    () => (month === 'all' ? settlements : settlements.filter(s => s.settlementMonth === month)),
    [settlements, month],
  )

  const selectedSettlement = settlements.find(s => s.orderId === selectedOrderId) ?? null

  function closeDrawer() {
    setSelectedOrderId(null)
  }

  return (
    <div className="p-6">
      <PageHeader
        title="정산/매출"
        actions={<Select options={MONTH_OPTIONS} value={month} onChange={setMonth} className="w-[140px]" />}
      />

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={s => s.orderId}
          loading={isLoading}
          onRowClick={s => setSelectedOrderId(s.orderId)}
        />
      </div>

      <Drawer open={selectedSettlement !== null} onClose={closeDrawer} title="건별 정산 상세" width="md">
        {selectedSettlement && <SettlementDetailContent settlement={selectedSettlement} />}
      </Drawer>
    </div>
  )
}

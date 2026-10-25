import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { SellerSettlementSummary } from '@aechak/api'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  PageHeader,
  Select,
  StatusPill,
  type Column,
} from '@aechak/design-system/web'
import {
  ALL_MONTHS,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_OPTIONS,
  SETTLEMENT_STATUS_VARIANT,
  SettlementDetailContent,
  formatDate,
  formatDateTime,
  formatMonth,
  formatWon,
  monthSelectOptions,
  settlementDetailErrorMessage,
  useSettlementDetail,
  useSettlementMonths,
  useSettlements,
} from '@/features/settlements'

export const Route = createFileRoute('/settlements/')({
  component: SettlementsRoute,
})

const PAGE_SIZE = 20

// 숫자/날짜 셀은 모두 tabular — 주문번호와 최종 금액만 굵게.
const num = (text: string, bold = false) => (
  <span className={bold ? 'font-semibold tabular-nums' : 'tabular-nums'}>{text}</span>
)

// 금액은 서버가 준 원 단위 정수를 그대로 보여 준다 — 화면에서 다시 계산하거나 반올림하지 않는다.
const columns: Column<SellerSettlementSummary>[] = [
  { key: 'orderId', label: '주문번호', render: s => num(s.orderId, true) },
  { key: 'settlementMonth', label: '정산월', align: 'right', render: s => num(formatMonth(s.settlementMonth)) },
  { key: 'confirmedAt', label: '구매확정일', align: 'right', render: s => num(formatDateTime(s.confirmedAt)) },
  {
    key: 'expectedPayoutDate',
    label: '정산예정일',
    align: 'right',
    render: s => num(formatDate(s.expectedPayoutDate)),
  },
  { key: 'productAmount', label: '상품금액', align: 'right', render: s => num(formatWon(s.productAmount)) },
  {
    key: 'feeAmount',
    label: '수수료',
    align: 'right',
    render: s => num(s.feeAmount > 0 ? `-${formatWon(s.feeAmount)}` : formatWon(s.feeAmount)),
  },
  { key: 'finalAmount', label: '최종정산금액', align: 'right', render: s => num(formatWon(s.finalAmount), true) },
  {
    key: 'status',
    label: '상태',
    align: 'center',
    render: s => (
      <StatusPill variant={SETTLEMENT_STATUS_VARIANT[s.status]}>
        {SETTLEMENT_STATUS_LABEL[s.status]}
      </StatusPill>
    ),
  },
]

interface Filters {
  month: string
  status: string
  page: number
}

function SettlementsRoute() {
  const [filters, setFilters] = useState<Filters>({ month: ALL_MONTHS, status: '', page: 0 })
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const months = useSettlementMonths()
  const { data, isLoading, isError } = useSettlements({ ...filters, size: PAGE_SIZE })
  const detail = useSettlementDetail(selectedOrderId)

  // 필터를 좁혀 페이지가 범위를 벗어나면(마지막 페이지에서 월을 바꾼 경우 등) 되돌린다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && filters.page > lastPage) setFilters(prev => ({ ...prev, page: lastPage }))
  }, [data, filters.page, lastPage])

  // 필터를 바꾸면 페이지는 늘 처음으로 — 3페이지를 보다 월을 바꾸면 빈 표가 나온다.
  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) =>
    setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const totalPages = data?.totalPages ?? 0

  return (
    <div className="p-6">
      <PageHeader title="정산/매출" />

      <FilterBar>
        {/* FilterBar의 Select는 라벨 칸이 없어 aria-label로 이름을 준다(이름 없는 combobox 금지). */}
        <Select
          aria-label="정산월"
          options={monthSelectOptions(months.data)}
          value={filters.month}
          onChange={month => setFilter({ month })}
          className="w-[160px]"
        />
        <Select
          aria-label="지급 상태"
          options={SETTLEMENT_STATUS_OPTIONS}
          value={filters.status}
          onChange={status => setFilter({ status })}
          className="w-[160px]"
        />
      </FilterBar>

      {/* 월 선택지를 못 읽었다고 전체 조회까지 막지는 않는다 — 고를 수 없는 이유만 알린다. */}
      {months.isError && (
        <Alert variant="error" className="mt-3">
          정산월 목록을 불러오지 못해 기간을 고를 수 없어요. 전체 기간은 그대로 볼 수 있어요.
        </Alert>
      )}

      <p className="mt-3 text-body-sm text-text-tertiary">
        주문 하나가 한 행이에요. 금액은 구매확정 시점에 확정된 정산 원장 값이고, 지급 예정일은
        구매확정일에서 5일 뒤예요.
      </p>

      <div className="mt-2">
        <DataTable
          columns={columns}
          rows={data?.settlements ?? []}
          rowKey={s => s.orderId}
          loading={isLoading}
          // 실패와 "데이터 없음"을 같은 문구로 떨구지 않는다.
          emptyLabel={isError ? '정산 내역을 불러오지 못했어요.' : '조건에 맞는 정산 내역이 없어요.'}
          onRowClick={s => setSelectedOrderId(s.orderId)}
        />
      </div>

      {totalPages > 1 && (
        <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page === 0}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            이전
          </Button>
          <span className="text-body-sm tabular-nums text-text-secondary">
            {filters.page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.hasNext}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </nav>
      )}

      <Drawer
        open={selectedOrderId !== null}
        onClose={() => setSelectedOrderId(null)}
        title="건별 정산 상세"
        width="lg"
      >
        {selectedOrderId !== null && (
          <SettlementDetailContent
            orderId={selectedOrderId}
            detail={detail.data}
            isPending={detail.isPending}
            isError={detail.isError}
            errorMessage={settlementDetailErrorMessage(detail.error)}
            onRetry={() => void detail.refetch()}
          />
        )}
      </Drawer>
    </div>
  )
}

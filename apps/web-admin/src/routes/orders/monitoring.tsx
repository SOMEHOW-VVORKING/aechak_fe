import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle,
  Clock,
  PackageCheck,
  RotateCcw,
  Truck,
} from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  MetricCard,
  Modal,
  SearchInput,
  StatusPill,
  Textarea,
  Timeline,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminOrderMonitorRows } from '@/features/order-monitoring'
import type { AdminOrderMonitorRow, AdminOrderStatus } from '@/features/order-monitoring'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

// 플랫폼 전체 주문을 보는 admin 경로가 없다(셀러·구매자 본인 스코프 경로만 있다). 안내 화면으로
// 돌려보내는 대신 예시 데이터로 모양을 보여주고 상단 띠로 밝힌다(SCRUM-308).
export const Route = createFileRoute('/orders/monitoring')({
  component: OrdersMonitoringPage,
})

const statusMeta: Record<AdminOrderStatus, StatusMeta> = {
  paid: { label: '결제 완료', variant: 'info', icon: CheckCircle },
  preparing: { label: '상품 준비', variant: 'warning', icon: Clock },
  shipping: { label: '배송 중', variant: 'brand', icon: Truck },
  delivered: { label: '배송 완료', variant: 'success', icon: PackageCheck },
  confirmed: { label: '구매 확정', variant: 'muted', icon: CheckCircle },
  claimed: { label: '클레임', variant: 'error', icon: RotateCcw },
}

const statusFilterOptions = [
  { value: 'all', label: '주문 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const delayFilterOptions = [
  { value: 'all', label: '지연 여부 전체' },
  { value: 'delayed', label: '지연 신호만' },
]

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

function makeOrderColumns(
  onOpenDetail: (row: AdminOrderMonitorRow) => void,
): Column<AdminOrderMonitorRow>[] {
  return [
    {
      key: 'id',
      label: '주문번호',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
            {row.id}
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">{row.orderedAt}</p>
        </div>
      ),
    },
    {
      key: 'itemSummary',
      label: '상품',
      render: row => (
        <div className="min-w-0">
          <p className="truncate text-body-sm text-text-primary">{row.itemSummary}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.sellerName} / {row.buyerMasked}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      label: '결제 금액',
      align: 'right',
      render: row => <span className="tabular-nums">{won(row.amount)}</span>,
    },
    {
      key: 'courier',
      label: '배송',
      render: row =>
        row.courier ? (
          <div className="min-w-0">
            <p className="text-body-sm text-text-primary">{row.courier}</p>
            <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">
              {row.trackingNumber}
            </p>
          </div>
        ) : (
          <span className="text-body-sm text-text-tertiary">송장 미등록</span>
        ),
    },
    {
      key: 'status',
      label: '주문 상태',
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={statusMeta[row.status]} />
          {row.delayNote && (
            <p className="mt-1.5 pl-2.5 text-caption text-warning-fg">지연 신호</p>
          )}
        </div>
      ),
    },
  ]
}

function OrdersMonitoringPage() {
  const { data, isLoading } = useAdminOrderMonitorRows()
  const {
    items,
    patchRow,
    selected,
    select,
    closeDrawer,
    confirmOpen,
    setConfirmOpen,
    toast,
    setToast,
  } = useDetailList(data)

  const [statusFilter, setStatusFilter] = useState('all')
  const [delayFilter, setDelayFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (delayFilter === 'delayed' && !row.delayNote) return false
        if (
          search &&
          !row.id.includes(search) &&
          !row.sellerName.includes(search) &&
          !row.buyerMasked.includes(search)
        )
          return false
        return true
      }),
    [items, statusFilter, delayFilter, search],
  )

  const [nudgeMemo, setNudgeMemo] = useState('')

  function openDrawer(row: AdminOrderMonitorRow) {
    select(row.id)
    setNudgeMemo(row.nudgeMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 독촉 기록을 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function sendNudge(target: AdminOrderMonitorRow) {
    patchRow(target.id, { nudgeMemo })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const orderColumns = useMemo(() => makeOrderColumns(openDrawer), [])

  const shippingCount = items.filter(row => row.status === 'shipping').length
  const preparingCount = items.filter(row => row.status === 'preparing').length
  const delayedCount = items.filter(row => row.delayNote).length
  const todayAmount = items.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="p-6">
      <PageIntro
        title="주문 배송 모니터링"
        description="플랫폼 전체 주문과 배송 상태를 모니터링해요."
      />

      <MockDataNotice>
        플랫폼 전체 주문을 보는 admin 경로가 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="상품 준비"
          value={`${preparingCount}건`}
          icon={<Clock className="size-full" />}
        />
        <MetricCard
          label="배송 중"
          value={`${shippingCount}건`}
          icon={<Truck className="size-full" />}
        />
        <MetricCard
          label="지연 신호"
          value={`${delayedCount}건`}
          icon={<AlertTriangle className="size-full" />}
          variant={delayedCount > 0 ? 'urgent' : 'default'}
        />
        <MetricCard label="조회 범위 결제액" value={won(todayAmount)} variant="quiet" />
      </div>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect
          options={delayFilterOptions}
          value={delayFilter}
          onChange={setDelayFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="주문번호 · 셀러 · 구매자 검색"
          className="w-72"
        />
      </FilterBar>

      <DataTable
        columns={orderColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 주문이 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="주문 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${selected.sellerName}`}
            actions={
              <Button
                variant="secondary"
                leftIcon={<Bell className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                셀러 발송 독촉
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  {selected.courier ? (
                    <StatusPill variant="neutral">
                      <Truck className="size-3" />
                      {selected.courier}
                    </StatusPill>
                  ) : (
                    <StatusPill variant="muted">
                      <Ban className="size-3" />
                      송장 미등록
                    </StatusPill>
                  )}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '구매자', value: selected.buyerMasked },
                  { label: '셀러', value: selected.sellerName },
                  { label: '결제 금액', value: won(selected.amount) },
                  { label: '주문 시각', value: selected.orderedAt },
                ]}
              />
            </DrawerSummaryCard>

            {selected.delayNote && (
              <div className="rounded-md border border-warning-border bg-warning-surface px-3 py-2.5 text-body-sm text-warning-fg">
                {selected.delayNote}
              </div>
            )}

            <DetailField label="주문 품목">
              <p className="text-body-sm text-text-primary">{selected.itemSummary}</p>
            </DetailField>

            <DetailField label="배송 진행">
              <Timeline steps={selected.stages} />
            </DetailField>

            <DetailField label="독촉 메모" visibility="internal-only">
              <Textarea
                value={nudgeMemo}
                onChange={setNudgeMemo}
                maxLength={300}
                rows={3}
                placeholder="셀러에게 전달할 독촉 사유를 입력하세요."
              />
            </DetailField>
          </DetailDrawerBody>
        )}
      </Drawer>

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="셀러에게 발송 독촉을 보낼까요?"
          description="셀러센터 알림과 메일이 함께 나가고 독촉 이력이 주문에 남아요."
          confirmLabel="독촉 보내기"
          onConfirm={() => sendNudge(selected)}
        >
          <SummaryGrid
            items={[
              { label: '주문', value: selected.id },
              { label: '셀러', value: selected.sellerName },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}

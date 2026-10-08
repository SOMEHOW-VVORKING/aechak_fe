import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, CheckCircle, LogOut, Minus, Pause, Save, Wallet } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { SellerAccount, SellerOperatingStatus } from '@aechak/domain'
import { useSellerAccounts } from '@/features/sellers'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { SellerTypePill, sellerTypeLabel } from '@/shared/components/SellerTypePill'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

export const Route = createFileRoute('/sellers/')({
  component: SellersPage,
})

const operatingStatusMeta: Record<SellerOperatingStatus, StatusMeta> = {
  active: { label: '영업중', variant: 'success', icon: CheckCircle },
  suspended: { label: '판매정지', variant: 'danger', icon: Ban },
  'on-hold': { label: '휴업', variant: 'muted', icon: Pause },
  withdrawn: { label: '퇴점', variant: 'muted', icon: LogOut },
}

const statusFilterOptions = [
  { value: 'all', label: '영업 상태 전체' },
  ...Object.entries(operatingStatusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const typeFilterOptions = [
  { value: 'all', label: '판매자 유형' },
  { value: 'business', label: '사업자' },
  { value: 'individual', label: '개인' },
]

const suspensionReasonOptions = [
  { value: 'false-info', label: '상품 정보 허위 기재' },
  { value: 'repeated-report', label: '신고 누적' },
  { value: 'fraud', label: '결제/정산 이상 거래' },
]

const suspensionPeriodOptions = [
  { value: '3d', label: '3일 정지' },
  { value: '7d', label: '7일 정지' },
  { value: '30d', label: '30일 정지' },
]

function makeSellerColumns(onOpenDetail: (row: SellerAccount) => void): Column<SellerAccount>[] {
  return [
    {
      key: 'shopName',
      label: '셀러명',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.shopName}</RowLinkButton>,
    },
    { key: 'representativeNameMasked', label: '대표자' },
    {
      key: 'sellerType',
      label: '유형',
      align: 'center',
      render: row => <SellerTypePill sellerType={row.sellerType} />,
    },
    {
      key: 'operatingStatus',
      label: '영업 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={operatingStatusMeta[row.operatingStatus]} />,
    },
    {
      key: 'productCount',
      label: '판매 상품',
      align: 'right',
      render: row => <span className="tabular-nums">{row.productCount}</span>,
    },
    {
      key: 'cumulativeOrders',
      label: '누적 주문',
      align: 'right',
      render: row => <span className="tabular-nums">{row.cumulativeOrders.toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'cumulativeReports',
      label: '신고 누적',
      align: 'right',
      render: row => <span className="tabular-nums">{row.cumulativeReports}</span>,
    },
    {
      key: 'lastActiveAt',
      label: '최근 접속',
      align: 'right',
      render: row => <span className="tabular-nums">{row.lastActiveAt}</span>,
    },
    {
      key: 'hasUnsettledAmount',
      label: '미정산',
      align: 'center',
      render: row =>
        row.hasUnsettledAmount ? (
          <StatusPill variant="warning">
            <Wallet className="size-3" />
            미정산
          </StatusPill>
        ) : (
          <StatusPill variant="neutral">
            <Minus className="size-3" />
            없음
          </StatusPill>
        ),
    },
  ]
}

function SellersPage() {
  const { data, isLoading } = useSellerAccounts()
  const { items, patchRow, selected, select, closeDrawer, confirmOpen, setConfirmOpen, toast, setToast } =
    useDetailList(data)

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.operatingStatus !== statusFilter) return false
        if (typeFilter !== 'all' && row.sellerType !== typeFilter) return false
        if (search && !row.shopName.includes(search)) return false
        return true
      }),
    [items, statusFilter, typeFilter, search],
  )

  const [suspensionReason, setSuspensionReason] = useState('')
  const [suspensionPeriod, setSuspensionPeriod] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: SellerAccount) {
    select(row.id)
    setSuspensionReason(row.suspensionReason ?? '')
    setSuspensionPeriod(row.suspensionPeriod ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function handleSaveMemo(target: SellerAccount) {
    patchRow(target.id, { internalMemo })
    setToast('메모를 저장했어요.')
  }

  function handleConfirmSuspend(target: SellerAccount) {
    patchRow(target.id, { operatingStatus: 'suspended', suspensionReason, suspensionPeriod, internalMemo })
    setToast(`'${target.shopName}'을 판매정지했어요.`)
    closeDrawer()
  }

  const sellerColumns = useMemo(() => makeSellerColumns(openDrawer), [])
  const suspensionReasonLabel =
    suspensionReasonOptions.find(opt => opt.value === suspensionReason)?.label ?? suspensionReason
  const suspensionPeriodLabel =
    suspensionPeriodOptions.find(opt => opt.value === suspensionPeriod)?.label ?? suspensionPeriod

  return (
    <div className="p-6">
      <PageIntro title="셀러 관리" description="승인된 셀러의 운영 상태를 확인하고 필요 시 제재를 처리합니다." />

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect narrow options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="셀러명 검색" className="w-64" />
      </FilterBar>

      <DataTable
        columns={sellerColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 셀러가 없습니다."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="셀러 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.shopName} · ${sellerTypeLabel(selected.sellerType)}`}
            actions={
              <>
                <Button
                  variant="danger"
                  leftIcon={<Ban className="size-4" />}
                  disabled={!suspensionReason || !suspensionPeriod}
                  onClick={() => setConfirmOpen(true)}
                >
                  판매정지
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<Save className="size-4" />}
                  onClick={() => handleSaveMemo(selected)}
                >
                  저장
                </Button>
              </>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={operatingStatusMeta[selected.operatingStatus]} />
                  <SellerTypePill sellerType={selected.sellerType} />
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '대표자', value: selected.representativeNameMasked },
                  { label: '판매 상품', value: `${selected.productCount}개` },
                  { label: '누적 주문', value: `${selected.cumulativeOrders.toLocaleString('ko-KR')}건` },
                  { label: '신고 누적', value: `${selected.cumulativeReports}건` },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="제재 이력">
              <HistoryList items={selected.sanctionHistory} emptyLabel="제재 이력이 없습니다." />
            </DetailField>

            <DetailField label="판매정지 사유">
              <Select
                options={suspensionReasonOptions}
                value={suspensionReason}
                onChange={setSuspensionReason}
                placeholder="사유 선택"
              />
            </DetailField>

            <DetailField label="제재 기간">
              <Select
                options={suspensionPeriodOptions}
                value={suspensionPeriod}
                onChange={setSuspensionPeriod}
                placeholder="기간 선택"
              />
            </DetailField>

            <DetailField label="내부 메모" visibility="internal-only">
              <Textarea
                value={internalMemo}
                onChange={setInternalMemo}
                maxLength={300}
                rows={3}
                placeholder="내부 공유용 메모를 입력하세요."
              />
            </DetailField>

            <Alert variant="warning">
              판매정지는 진행 중 주문 처리 후 적용돼요. 미정산 금액이 있으면 정산 보류로 전환돼요.
            </Alert>
          </DetailDrawerBody>
        )}
      </Drawer>

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={`'${selected.shopName}'을 판매정지할까요?`}
          description={`진행 중 주문은 처리 후 노출이 중단되고, 신규 판매가 즉시 막혀요. 정지 기간 ${suspensionPeriodLabel} 동안 셀러는 상품을 등록할 수 없어요.`}
          confirmLabel="판매정지"
          confirmVariant="danger"
          onConfirm={() => handleConfirmSuspend(selected)}
        >
          <SummaryGrid
            items={[
              { label: '사유', value: suspensionReasonLabel },
              { label: '기간', value: suspensionPeriodLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

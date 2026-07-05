import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Check, Clock, EyeOff, ImageOff } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { ProductReviewItem, ProductReviewSaleStatus } from '@aechak/domain'
import { useProductReviewItems } from '@/features/product-review'
import { ActorTag } from '@/shared/components/ActorTag'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailField } from '@/shared/components/DetailField'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

export const Route = createFileRoute('/products/review')({
  component: ProductReviewPage,
})

const saleStatusMeta: Record<
  ProductReviewSaleStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' | 'error' }
> = {
  'on-sale': { label: '판매중', variant: 'success' },
  suspended: { label: '판매 중지', variant: 'warning' },
  'pending-review': { label: '검수 대기', variant: 'neutral' },
  rejected: { label: '반려', variant: 'error' },
}

const saleStatusFilterOptions = [
  { value: 'all', label: '판매 상태 전체' },
  ...Object.entries(saleStatusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const aiReviewFilterOptions = [
  { value: 'all', label: 'AI 검수 상태' },
  { value: 'reviewing', label: '검수 중' },
  { value: 'passed', label: '검수 통과' },
]

const categoryFilterOptions = [
  { value: 'all', label: '카테고리' },
  { value: '사료/간식', label: '사료/간식' },
  { value: '용품', label: '용품' },
  { value: '건강/영양제', label: '건강/영양제' },
  { value: '위생/미용', label: '위생/미용' },
]

const processReasonOptions = [
  { value: 'medical-claim', label: '의약품성 효능 표현' },
  { value: 'exaggerated-ad', label: '과장 광고' },
  { value: 'banned-word', label: '금칙어' },
]

function ReviewCell({ item }: { item: ProductReviewItem }) {
  if (item.reviewActor) return <ActorTag actor={item.reviewActor} />
  return item.reviewStatus === 'passed' ? (
    <StatusPill variant="success">
      <Check className="size-3" />
      검수 통과
    </StatusPill>
  ) : (
    <StatusPill variant="info">
      <Clock className="size-3" />
      검수 중
    </StatusPill>
  )
}

function makeReviewColumns(onOpenDetail: (row: ProductReviewItem) => void): Column<ProductReviewItem>[] {
  return [
    {
      key: 'name',
      label: '상품명',
      render: row => (
        <button
          type="button"
          onClick={() => onOpenDetail(row)}
          className="font-medium text-text-primary hover:text-brand hover:underline"
        >
          {row.name}
        </button>
      ),
    },
    { key: 'sellerName', label: '셀러' },
    { key: 'category', label: '카테고리' },
    {
      key: 'saleStatus',
      label: '판매 상태',
      align: 'center',
      render: row => (
        <StatusPill variant={saleStatusMeta[row.saleStatus].variant}>
          {saleStatusMeta[row.saleStatus].label}
        </StatusPill>
      ),
    },
    {
      key: 'reportCount',
      label: '신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}</span>,
    },
    {
      key: 'reviewActor',
      label: 'AI 검수',
      align: 'center',
      render: row => <ReviewCell item={row} />,
    },
    {
      key: 'isBlinded',
      label: '블라인드',
      align: 'center',
      render: row =>
        row.isBlinded ? (
          <StatusPill variant="muted">
            <EyeOff className="size-3" />
            {row.blindType === 'auto' ? '자동 블라인드' : '블라인드'}
          </StatusPill>
        ) : null,
    },
    {
      key: 'registeredAt',
      label: '등록일',
      align: 'right',
      render: row => <span className="tabular-nums">{row.registeredAt}</span>,
    },
  ]
}

function ProductReviewPage() {
  const { data, isLoading } = useProductReviewItems()
  const [rows, setRows] = useState<ProductReviewItem[] | null>(null)
  useEffect(() => {
    if (data && rows === null) setRows(data)
  }, [data, rows])
  const items = rows ?? []

  const [saleStatusFilter, setSaleStatusFilter] = useState('all')
  const [aiReviewFilter, setAiReviewFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (saleStatusFilter !== 'all' && row.saleStatus !== saleStatusFilter) return false
        if (aiReviewFilter !== 'all' && row.reviewStatus !== aiReviewFilter) return false
        if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
        if (search && !row.name.includes(search) && !row.sellerName.includes(search)) return false
        return true
      }),
    [items, saleStatusFilter, aiReviewFilter, categoryFilter, search],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find(row => row.id === selectedId) ?? null

  const [decision, setDecision] = useState('pass')
  const [processReason, setProcessReason] = useState('')
  const [sellerNotice, setSellerNotice] = useState('')
  const [internalMemo, setInternalMemo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function openDrawer(row: ProductReviewItem) {
    setSelectedId(row.id)
    setDecision(row.saleStatus === 'rejected' ? 'reject' : 'pass')
    setProcessReason(row.processReason ?? '')
    setSellerNotice(row.sellerNotice ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function closeDrawer() {
    setSelectedId(null)
    setConfirmOpen(false)
  }

  function updateSelected(patch: Partial<ProductReviewItem>) {
    if (!selected) return
    setRows(prev => (prev ?? []).map(row => (row.id === selected.id ? { ...row, ...patch } : row)))
  }

  function handlePass() {
    updateSelected({
      saleStatus: 'on-sale',
      reviewStatus: 'passed',
      reviewActor: 'admin',
      isBlinded: false,
      internalMemo,
    })
    setToast('검수를 통과 처리했어요.')
    closeDrawer()
  }

  function handleKeepBlinded() {
    updateSelected({
      isBlinded: true,
      blindType: 'manual',
      reviewActor: 'admin',
      processReason,
      sellerNotice,
      internalMemo,
    })
    setToast('블라인드를 유지했어요.')
    closeDrawer()
  }

  function handleConfirmStopSale() {
    updateSelected({
      saleStatus: 'suspended',
      reviewActor: 'admin',
      processReason,
      sellerNotice,
      internalMemo,
    })
    setToast(`'${selected?.name}' 판매를 중지했어요.`)
    closeDrawer()
  }

  const reviewColumns = useMemo(() => makeReviewColumns(openDrawer), [])
  const processReasonLabel =
    processReasonOptions.find(opt => opt.value === processReason)?.label ?? processReason

  return (
    <div className="p-6">
      <PageHeader title="상품 검수 관리" />
      <p className="-mt-4 mb-5 text-body-sm text-text-tertiary">
        셀러 등록 상품 · 신고 상품 · 블라인드 상품을 검수합니다.
      </p>

      <FilterBar className="mb-3.5">
        <div className="w-40">
          <Select options={saleStatusFilterOptions} value={saleStatusFilter} onChange={setSaleStatusFilter} />
        </div>
        <div className="w-40">
          <Select options={aiReviewFilterOptions} value={aiReviewFilter} onChange={setAiReviewFilter} />
        </div>
        <div className="w-40">
          <Select options={categoryFilterOptions} value={categoryFilter} onChange={setCategoryFilter} />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="상품명 · 셀러 검색" className="w-64" />
      </FilterBar>

      <DataTable
        columns={reviewColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 상품이 없습니다."
      />

      <Drawer open={selected !== null} onClose={closeDrawer} title="상품 검수 상세" width="lg">
        {selected && (
          <div className="space-y-5">
            <div className="flex gap-3">
              <div className="flex size-[72px] flex-none items-center justify-center rounded-md bg-surface-sunken text-icon-muted">
                <ImageOff className="size-6" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-text-primary">{selected.name}</p>
                <p className="text-caption text-text-tertiary">
                  {selected.category} · {selected.price.toLocaleString('ko-KR')}원 · 등록 {selected.registeredAt}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selected.reviewActor && <ActorTag actor={selected.reviewActor} />}
                  {selected.isBlinded && (
                    <StatusPill variant="muted">
                      <EyeOff className="size-3" />
                      {selected.blindType === 'auto' ? '자동 블라인드' : '블라인드'}
                    </StatusPill>
                  )}
                </div>
              </div>
            </div>

            {selected.reportSummary && (
              <Alert variant="danger" title={`신고 ${selected.reportCount}건`}>
                {selected.reportSummary}
              </Alert>
            )}

            <DetailField label="검수 결과">
              <DecisionRadioGroup
                name="product-review-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'pass', label: '검수 통과', caption: '블라인드 해제 후 판매 재개' },
                  { value: 'reject', label: '반려', caption: '수정 요청 후 비노출 유지' },
                ]}
              />
            </DetailField>

            <DetailField label="처리 사유">
              <Select
                options={processReasonOptions}
                value={processReason}
                onChange={setProcessReason}
                placeholder="사유 선택"
              />
            </DetailField>

            <DetailField label="셀러 안내 내용" visibility="visible-to-user">
              <Textarea
                value={sellerNotice}
                onChange={setSellerNotice}
                maxLength={300}
                rows={3}
                placeholder="셀러에게 전달할 안내 내용을 입력하세요."
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

            <div className="flex gap-2 border-t border-border-subtle pt-4">
              <Button variant="primary" leftIcon={<Check className="size-4" />} onClick={handlePass}>
                검수 통과
              </Button>
              <Button
                variant="secondary"
                leftIcon={<EyeOff className="size-4" />}
                onClick={handleKeepBlinded}
              >
                블라인드 유지
              </Button>
              <Button
                variant="danger"
                leftIcon={<Ban className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                판매 중지
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="상품을 판매 중지할까요?"
        description="판매 중지 시 즉시 노출이 중단되고 셀러에게 통보돼요. 처리 내역은 액션 로그에 기록돼요."
        confirmLabel="판매 중지"
        confirmVariant="danger"
        onConfirm={handleConfirmStopSale}
      >
        <SummaryGrid
          items={[
            { label: '대상 상품', value: selected?.name ?? '' },
            { label: '사유', value: processReasonLabel },
          ]}
        />
      </Modal>

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

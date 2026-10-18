import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Check, Clock, EyeOff, ImageOff } from 'lucide-react'
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
import type { ProductReviewItem, ProductReviewSaleStatus } from '@aechak/domain'
import { useProductReviewItems } from '@/features/product-review'
import { ActorTag } from '@/shared/components/ActorTag'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MediaPlaceholder } from '@/shared/components/MediaPlaceholder'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'
import { useDetailList } from '@/shared/hooks/useDetailList'

export const Route = createFileRoute('/products/review')({
  component: ProductReviewGate,
})

// 운영 진입 차단 스위치. admin 모듈에 상품 검수 API가 없어 목록·통과·블라인드·판매중지가 전부 목업이다 —
// 주소로 들어와도 열지 않는다. 아래 ProductReviewPage는 서버가 생기면 queries 층만 바꿔 살릴 배선.
const SERVER_PRODUCT_REVIEW_AVAILABLE = false

function ProductReviewGate() {
  if (!SERVER_PRODUCT_REVIEW_AVAILABLE) {
    return (
      <UnavailableScreen
        title="상품 검수 관리"
        description="셀러 등록 상품 · 신고 상품 · 블라인드 상품을 검수합니다."
        message="상품 검수 관리는 준비 중이에요"
      />
    )
  }
  return <ProductReviewPage />
}

const saleStatusMeta: Record<ProductReviewSaleStatus, StatusMeta> = {
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

function BlindPill({ blindType }: { blindType: ProductReviewItem['blindType'] }) {
  return (
    <StatusPill variant="muted">
      <EyeOff className="size-3" />
      {blindType === 'auto' ? '자동 블라인드' : '블라인드'}
    </StatusPill>
  )
}

function makeReviewColumns(onOpenDetail: (row: ProductReviewItem) => void): Column<ProductReviewItem>[] {
  return [
    {
      key: 'name',
      label: '상품명',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.name}</RowLinkButton>,
    },
    { key: 'sellerName', label: '셀러' },
    { key: 'category', label: '카테고리' },
    {
      key: 'saleStatus',
      label: '판매 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={saleStatusMeta[row.saleStatus]} />,
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
      render: row => (row.isBlinded ? <BlindPill blindType={row.blindType} /> : null),
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
  const { items, patchRow, selected, select, closeDrawer, confirmOpen, setConfirmOpen, toast, setToast } =
    useDetailList(data)

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

  const [decision, setDecision] = useState('pass')
  const [processReason, setProcessReason] = useState('')
  const [sellerNotice, setSellerNotice] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: ProductReviewItem) {
    select(row.id)
    setDecision(row.saleStatus === 'rejected' ? 'reject' : 'pass')
    setProcessReason(row.processReason ?? '')
    setSellerNotice(row.sellerNotice ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function handlePass(target: ProductReviewItem) {
    patchRow(target.id, {
      saleStatus: 'on-sale',
      reviewStatus: 'passed',
      reviewActor: 'admin',
      isBlinded: false,
      internalMemo,
    })
    setToast('검수를 통과 처리했어요.')
    closeDrawer()
  }

  function handleKeepBlinded(target: ProductReviewItem) {
    patchRow(target.id, {
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

  function handleConfirmStopSale(target: ProductReviewItem) {
    patchRow(target.id, {
      saleStatus: 'suspended',
      reviewActor: 'admin',
      processReason,
      sellerNotice,
      internalMemo,
    })
    setToast(`'${target.name}' 판매를 중지했어요.`)
    closeDrawer()
  }

  const reviewColumns = useMemo(() => makeReviewColumns(openDrawer), [])
  const processReasonLabel =
    processReasonOptions.find(opt => opt.value === processReason)?.label ?? processReason

  return (
    <div className="p-6">
      <PageIntro title="상품 검수 관리" description="셀러 등록 상품 · 신고 상품 · 블라인드 상품을 검수합니다." />

      <FilterBar className="mb-3.5">
        <FilterSelect options={saleStatusFilterOptions} value={saleStatusFilter} onChange={setSaleStatusFilter} />
        <FilterSelect options={aiReviewFilterOptions} value={aiReviewFilter} onChange={setAiReviewFilter} />
        <FilterSelect options={categoryFilterOptions} value={categoryFilter} onChange={setCategoryFilter} />
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

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="상품 검수 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            actions={
              <>
                <Button variant="primary" leftIcon={<Check className="size-4" />} onClick={() => handlePass(selected)}>
                  검수 통과
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<EyeOff className="size-4" />}
                  onClick={() => handleKeepBlinded(selected)}
                >
                  블라인드 유지
                </Button>
                <Button variant="danger" leftIcon={<Ban className="size-4" />} onClick={() => setConfirmOpen(true)}>
                  판매 중지
                </Button>
              </>
            }
          >
            <div className="flex gap-3">
              <MediaPlaceholder className="size-[72px] flex-none">
                <ImageOff className="size-6" />
              </MediaPlaceholder>
              <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-text-primary">{selected.name}</p>
                <p className="text-caption text-text-tertiary">
                  {selected.category} · {selected.price.toLocaleString('ko-KR')}원 · 등록 {selected.registeredAt}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selected.reviewActor && <ActorTag actor={selected.reviewActor} />}
                  {selected.isBlinded && <BlindPill blindType={selected.blindType} />}
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
          </DetailDrawerBody>
        )}
      </Drawer>

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="상품을 판매 중지할까요?"
          description="판매 중지 시 즉시 노출이 중단되고 셀러에게 통보돼요. 처리 내역은 액션 로그에 기록돼요."
          confirmLabel="판매 중지"
          confirmVariant="danger"
          onConfirm={() => handleConfirmStopSale(selected)}
        >
          <SummaryGrid
            items={[
              { label: '대상 상품', value: selected.name },
              { label: '사유', value: processReasonLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

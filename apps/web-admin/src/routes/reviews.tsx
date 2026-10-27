import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Check, Eye, EyeOff, Image, Trash2 } from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  RatingInput,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminReviews } from '@/features/reviews'
import type { AdminReview, AdminReviewStatus } from '@/features/reviews'
import { ActorTag } from '@/shared/components/ActorTag'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

// 운영자가 전체 리뷰를 조회하고 숨기는 admin 경로가 없다. 안내 화면으로 돌려보내는 대신 예시
// 데이터로 모양을 보여주고 상단 띠로 밝힌다(SCRUM-308).
export const Route = createFileRoute('/reviews')({
  component: ReviewsPage,
})

const statusMeta: Record<AdminReviewStatus, StatusMeta> = {
  visible: { label: '노출', variant: 'success', icon: Eye },
  reported: { label: '신고 접수', variant: 'warning', icon: AlertTriangle },
  blinded: { label: '블라인드', variant: 'muted', icon: EyeOff },
  deleted: { label: '삭제', variant: 'danger', icon: Trash2 },
}

const statusFilterOptions = [
  { value: 'all', label: '노출 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const ratingFilterOptions = [
  { value: 'all', label: '별점 전체' },
  { value: 'low', label: '1~2점' },
  { value: 'mid', label: '3점' },
  { value: 'high', label: '4~5점' },
]

type ReviewDecision = 'keep' | 'blind' | 'delete'

const blindReasonOptions = [
  { value: 'abuse', label: '욕설/비방' },
  { value: 'external-trade', label: '외부 거래 유도' },
  { value: 'ad-spam', label: '광고/스팸' },
  { value: 'privacy', label: '개인정보 노출' },
  { value: 'irrelevant', label: '상품과 무관' },
]

const decisionModalMeta: Record<
  ReviewDecision,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    nextStatus: AdminReviewStatus
  }
> = {
  keep: {
    title: '리뷰를 그대로 둘까요?',
    description: '신고가 종결되고 리뷰는 계속 노출돼요. 신고자에게 결과가 통보돼요.',
    confirmLabel: '노출 유지',
    confirmVariant: 'primary',
    nextStatus: 'visible',
  },
  blind: {
    title: '리뷰를 블라인드할까요?',
    description: '리뷰가 즉시 비노출되고 작성자에게 사유가 통보돼요. 되돌릴 수 있어요.',
    confirmLabel: '블라인드',
    confirmVariant: 'primary',
    nextStatus: 'blinded',
  },
  delete: {
    title: '리뷰를 삭제할까요?',
    description: '삭제된 리뷰는 복구할 수 없어요. 작성자에게 통보되고 액션 로그에 남아요.',
    confirmLabel: '삭제',
    confirmVariant: 'danger',
    nextStatus: 'deleted',
  },
}

function makeReviewColumns(onOpenDetail: (row: AdminReview) => void): Column<AdminReview>[] {
  return [
    {
      key: 'content',
      label: '리뷰',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)}>
            <span className="line-clamp-1">{row.content}</span>
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.writerMasked} / {row.productName}
          </p>
        </div>
      ),
    },
    {
      key: 'rating',
      label: '별점',
      align: 'center',
      render: row => <RatingInput value={row.rating} readonly size={14} />,
    },
    {
      key: 'photoCount',
      label: '사진',
      align: 'right',
      render: row =>
        row.photoCount > 0 ? (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Image className="size-3.5 text-icon-muted" />
            {row.photoCount}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'reportCount',
      label: '신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}건</span>,
    },
    {
      key: 'createdAt',
      label: '작성',
      align: 'right',
      render: row => <span className="tabular-nums">{row.createdAt}</span>,
    },
    {
      key: 'status',
      label: '노출 상태',
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={statusMeta[row.status]} />
          {row.blindReason && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">{row.blindReason}</p>
          )}
        </div>
      ),
    },
  ]
}

function ReviewsPage() {
  const { data, isLoading } = useAdminReviews()
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
  const [ratingFilter, setRatingFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (ratingFilter === 'low' && row.rating > 2) return false
        if (ratingFilter === 'mid' && row.rating !== 3) return false
        if (ratingFilter === 'high' && row.rating < 4) return false
        if (search && !row.content.includes(search) && !row.productName.includes(search))
          return false
        return true
      }),
    [items, statusFilter, ratingFilter, search],
  )

  const [decision, setDecision] = useState<ReviewDecision>('keep')
  const [blindReason, setBlindReason] = useState('')
  const [writerNotice, setWriterNotice] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AdminReview) {
    select(row.id)
    setDecision(row.status === 'deleted' ? 'delete' : row.status === 'blinded' ? 'blind' : 'keep')
    setBlindReason(row.blindReason ?? '')
    setWriterNotice(row.writerNotice ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 결정 결과를 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function applyDecision(target: AdminReview, nextStatus: AdminReviewStatus) {
    patchRow(target.id, {
      status: nextStatus,
      blindActor: nextStatus === 'visible' ? undefined : 'admin',
      blindReason,
      writerNotice,
      internalMemo,
    })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const reviewColumns = useMemo(() => makeReviewColumns(openDrawer), [])
  const decisionMeta = decisionModalMeta[decision]
  const blindReasonLabel =
    blindReasonOptions.find(opt => opt.value === blindReason)?.label ?? blindReason

  return (
    <div className="p-6">
      <PageIntro title="리뷰 관리" description="등록된 리뷰를 확인하고 부적절한 리뷰를 숨겨요." />

      <MockDataNotice>
        운영자용 리뷰 조회/블라인드 경로가 admin 모듈에 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect
          options={ratingFilterOptions}
          value={ratingFilter}
          onChange={setRatingFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="리뷰 내용 / 상품 검색"
          className="w-64"
        />
      </FilterBar>

      <DataTable
        columns={reviewColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 리뷰가 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="리뷰 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} / ${selected.writerMasked}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<Check className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                제출
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  {selected.blindActor && <ActorTag actor={selected.blindActor} />}
                  {selected.reportCount > 0 && (
                    <StatusPill variant="warning">신고 {selected.reportCount}건</StatusPill>
                  )}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '상품', value: selected.productName },
                  { label: '셀러', value: selected.sellerName },
                  { label: '작성 시각', value: selected.createdAt },
                  { label: '첨부 사진', value: `${selected.photoCount}장` },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="리뷰 내용">
              <div className="rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
                <RatingInput value={selected.rating} readonly size={16} />
                <p className="mt-2 break-keep text-body-sm text-text-secondary">
                  {selected.content}
                </p>
              </div>
            </DetailField>

            <DetailField label={`처리 이력 / ${selected.history.length}건`}>
              <HistoryList items={selected.history} emptyLabel="처리 이력이 없어요." />
            </DetailField>

            <DetailField label="처리 결정">
              <DecisionRadioGroup
                name="review-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'keep', label: '노출 유지', caption: '신고 종결' },
                  { value: 'blind', label: '블라인드', caption: '비노출, 되돌릴 수 있음' },
                  { value: 'delete', label: '삭제', caption: '복구 불가' },
                ]}
              />
            </DetailField>

            <DetailField label="처리 사유">
              <Select
                options={blindReasonOptions}
                value={blindReason}
                onChange={setBlindReason}
                placeholder="사유 선택"
              />
            </DetailField>

            <DetailField label="작성자 안내 문구" visibility="visible-to-user">
              <Textarea
                value={writerNotice}
                onChange={setWriterNotice}
                maxLength={300}
                rows={3}
                placeholder="작성자에게 전달할 안내를 입력하세요."
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
          title={decisionMeta.title}
          description={decisionMeta.description}
          confirmLabel={decisionMeta.confirmLabel}
          confirmVariant={decisionMeta.confirmVariant}
          onConfirm={() => applyDecision(selected, decisionMeta.nextStatus)}
        >
          <SummaryGrid
            items={[
              { label: '작성자', value: selected.writerMasked },
              { label: '사유', value: blindReasonLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}

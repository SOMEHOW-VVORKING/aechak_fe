import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Image, Sparkles } from 'lucide-react'
import { Alert, Button, DataTable, Drawer, FilterBar, Modal, Textarea, Toast } from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { ActorTag } from '@/shared/components/ActorTag'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { MediaPlaceholder } from '@/shared/components/MediaPlaceholder'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import {
  JUDGMENT_META,
  QUEUE_STATUS_FILTER_VALUES,
  QUEUE_STATUS_META,
  REJECT_REASON_MAX_LENGTH,
  decisionErrorMessage,
  isStaleDecision,
  loadErrorMessage,
  type AiReviewRowView,
  type QueueStatus,
} from '../ai-review-queue.map'
import {
  DEFAULT_PAGE_SIZE,
  useAiReviewDetail,
  useAiReviewQueue,
  useDecideAiReview,
  type AiReviewDecision,
} from '../ai-review-queue.queries'

const ALL = 'all'

const statusFilterOptions = [
  { value: ALL, label: '전체 상태' },
  ...QUEUE_STATUS_FILTER_VALUES.map(value => ({ value, label: QUEUE_STATUS_META[value].label })),
]

const decisionModalMeta: Record<
  AiReviewDecision,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger'; message: string }
> = {
  approve: {
    title: '상품을 승인할까요?',
    description: '승인하면 반려가 풀려 바로 구매자에게 노출돼요.',
    confirmLabel: '승인',
    confirmVariant: 'primary',
    message: '상품을 승인했어요.',
  },
  reject: {
    title: '상품을 반려할까요?',
    description: '반려가 확정되고 사유가 셀러에게 그대로 보여요. 셀러가 고쳐도 관리자가 다시 확인해야 노출돼요.',
    confirmLabel: '반려',
    confirmVariant: 'danger',
    message: '상품을 반려했어요.',
  },
}

function makeQueueColumns(onOpenDetail: (row: AiReviewRowView) => void): Column<AiReviewRowView>[] {
  return [
    {
      key: 'productName',
      label: '상품',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.productName}</RowLinkButton>,
    },
    { key: 'sellerName', label: '셀러' },
    {
      key: 'judgment',
      label: '최근 판정',
      align: 'center',
      render: row => <StatusMetaPill meta={JUDGMENT_META[row.judgment]} />,
    },
    {
      key: 'blindedAt',
      label: '판정 시각',
      align: 'right',
      render: row => <span className="tabular-nums">{row.blindedAt}</span>,
    },
    {
      key: 'status',
      label: '검토 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={QUEUE_STATUS_META[row.status]} />,
    },
  ]
}

// AI가 반려한 상품을 운영자가 확인해 오탐이면 승인하고 맞으면 반려를 확정한다. 상세는 목록과 별도 쿼리로 받는다 —
// 결정 뒤 재조회로 행이 현재 필터에서 빠져도 Drawer가 갑자기 닫히지 않게 하려는 것이다(입점 심사와 같은 구성).
export function AiReviewQueuePage() {
  const [statusFilter, setStatusFilter] = useState<QueueStatus | typeof ALL>('PENDING_REVIEW')
  const [page, setPage] = useState(0)
  const { rows, totalCount, isLoading, isError, error } = useAiReviewQueue({
    status: statusFilter === ALL ? null : statusFilter,
    page,
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))
  // 마지막 페이지의 유일한 행을 처리하면 그 페이지가 사라진다. 응답이 온 뒤에만 보정한다.
  const lastPage = totalPages - 1
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage)
  }, [isLoading, isError, page, lastPage])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailQuery = useAiReviewDetail(selectedId)
  const detail = detailQuery.detail

  const [decision, setDecision] = useState<AiReviewDecision>('approve')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'info' } | null>(null)
  const decide = useDecideAiReview()

  function openDrawer(row: AiReviewRowView) {
    setSelectedId(row.productId)
    setDecision('approve')
    setReason('')
    setDecisionError(null)
  }

  function closeDrawer() {
    setSelectedId(null)
    setConfirmOpen(false)
    setDecisionError(null)
  }

  function submitDecision() {
    if (!detail) return
    const meta = decisionModalMeta[decision]
    decide.mutate(
      { productId: detail.productId, decision, ...(decision === 'reject' ? { reason: reason.trim() } : {}) },
      {
        onSuccess: () => {
          setToast({ message: meta.message, variant: 'success' })
          closeDrawer()
        },
        onError: requestError => {
          setConfirmOpen(false)
          // 409는 셀러가 먼저 고쳤거나 다른 운영자가 처리한 경우다. 무효화로 목록이 이미 새로 오므로 닫고 알린다.
          if (isStaleDecision(requestError)) {
            setToast({ message: decisionErrorMessage(requestError), variant: 'info' })
            closeDrawer()
            return
          }
          setDecisionError(decisionErrorMessage(requestError))
        },
      },
    )
  }

  const canSubmit = decision === 'approve' || reason.trim().length > 0
  const decisionMeta = decisionModalMeta[decision]
  const queueColumns = makeQueueColumns(openDrawer)

  return (
    <div className="p-6">
      <PageIntro
        title="AI 검수 큐"
        description="AI가 반려한 상품을 확인해 오탐이면 승인하고, 맞으면 반려를 확정합니다."
      />

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={next => {
            setStatusFilter(next as QueueStatus | typeof ALL)
            setPage(0)
          }}
        />
      </FilterBar>

      {isError && (
        <Alert variant="error" className="mb-3.5">
          {loadErrorMessage(error)}
        </Alert>
      )}

      <DataTable
        columns={queueColumns}
        rows={rows}
        rowKey={row => row.productId}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="검토할 상품이 없어요."
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-body-sm text-text-tertiary">
        <span>
          전체 <span className="font-semibold tabular-nums text-text-primary">{totalCount}</span>건
        </span>
        {totalPages > 1 && (
          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronLeft className="size-4" />}
              disabled={page === 0}
              onClick={() => setPage(current => Math.max(0, current - 1))}
            >
              이전
            </Button>
            <span className="tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight className="size-4" />}
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(current => current + 1)}
            >
              다음
            </Button>
          </span>
        )}
      </div>

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="AI 검수 상세" width="lg">
        {detailQuery.isLoading && <p className="text-body-sm text-text-tertiary">상세를 불러오는 중이에요.</p>}
        {detailQuery.isError && <Alert variant="error">{loadErrorMessage(detailQuery.error)}</Alert>}
        {detail && (
          <DetailDrawerBody
            subtitle={`${detail.productName} / ${detail.sellerName}`}
            actions={
              detail.awaitingAdminReview ? (
                <Button
                  variant="primary"
                  leftIcon={<Check className="size-4" />}
                  disabled={!canSubmit}
                  onClick={() => setConfirmOpen(true)}
                >
                  제출
                </Button>
              ) : (
                <p className="text-body-sm text-text-tertiary">처리할 검토가 없어요.</p>
              )
            }
          >
            {decisionError && <Alert variant="warning">{decisionError}</Alert>}

            <DrawerSummaryCard
              pills={
                <>
                  <ActorTag actor="ai" />
                  {detail.judgment && <StatusMetaPill meta={JUDGMENT_META[detail.judgment]} />}
                </>
              }
            >
              {detail.reasonSummary && (
                <p className="flex items-start gap-1.5 text-body-sm text-text-primary">
                  <Sparkles className="mt-0.5 size-3.5 flex-none text-brand" />
                  <strong>{detail.reasonSummary}</strong>
                </p>
              )}
              {detail.sellerNotice && <p className="text-body-sm text-text-secondary">{detail.sellerNotice}</p>}
              <SummaryGrid
                items={[
                  { label: '판정 시각', value: detail.settledAt },
                  { label: '카테고리', value: detail.categoryPath || '—' },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="대표 이미지">
              {detail.representativeImageUrl ? (
                <img
                  src={detail.representativeImageUrl}
                  alt={`${detail.productName} 대표 이미지`}
                  className="h-[150px] w-full rounded-md object-cover"
                />
              ) : (
                <MediaPlaceholder className="h-[150px] w-full">
                  <Image className="size-8" />
                </MediaPlaceholder>
              )}
            </DetailField>

            <DetailField label="상품 설명">
              <p className="whitespace-pre-wrap text-body-sm text-text-primary">{detail.description || '—'}</p>
            </DetailField>

            {detail.optionNames.length > 0 && (
              <DetailField label="옵션">
                <p className="text-body-sm text-text-primary">{detail.optionNames.join(' / ')}</p>
              </DetailField>
            )}

            <DetailField label="반려 이력">
              <HistoryList items={detail.rejections} emptyLabel="반려된 적이 없어요." />
            </DetailField>

            {detail.awaitingAdminReview && (
              <>
                <DetailField label="처리 결과">
                  <DecisionRadioGroup
                    name="ai-review-decision"
                    value={decision}
                    onChange={setDecision}
                    options={[
                      { value: 'approve', label: '승인', caption: '반려 해제 / 구매자에게 다시 노출' },
                      { value: 'reject', label: '반려', caption: '반려 확정 / 셀러에게 사유 전달' },
                    ]}
                  />
                </DetailField>
                {decision === 'reject' && (
                  <DetailField label="반려 사유" visibility="visible-to-user">
                    <Textarea
                      value={reason}
                      onChange={setReason}
                      maxLength={REJECT_REASON_MAX_LENGTH}
                      rows={3}
                      placeholder="셀러가 무엇을 고쳐야 하는지 적어 주세요."
                    />
                  </DetailField>
                )}
              </>
            )}
          </DetailDrawerBody>
        )}
      </Drawer>

      {detail && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={decisionMeta.title}
          description={decisionMeta.description}
          confirmLabel={decisionMeta.confirmLabel}
          confirmVariant={decisionMeta.confirmVariant}
          loading={decide.isPending}
          onConfirm={submitDecision}
        >
          <SummaryGrid
            items={[
              { label: '상품', value: detail.productName },
              ...(decision === 'reject' ? [{ label: '사유', value: reason.trim() }] : []),
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast.message} variant={toast.variant} />}
    </div>
  )
}

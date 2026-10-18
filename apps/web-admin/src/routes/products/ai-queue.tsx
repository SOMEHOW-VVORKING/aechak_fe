import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertOctagon, Check, FileText, Image, MessageSquare, Sparkles } from 'lucide-react'
import {
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
import type { AiReviewQueueItem, AiReviewStatus, AiReviewTargetType } from '@aechak/domain'
import { useAiReviewQueueItems } from '@/features/ai-review-queue'
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
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { Tag } from '@/shared/components/Tag'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'
import { useDetailList } from '@/shared/hooks/useDetailList'

export const Route = createFileRoute('/products/ai-queue')({
  component: AiReviewQueueGate,
})

// 운영 진입 차단 스위치. admin 모듈에 AI 검수 큐 API가 없어 목록·승인·반려·삭제가 전부 목업이다 —
// 주소로 들어와도 열지 않는다. 아래 AiReviewQueuePage는 서버가 생기면 queries 층만 바꿔 살릴 배선.
const SERVER_AI_REVIEW_QUEUE_AVAILABLE = false

function AiReviewQueueGate() {
  if (!SERVER_AI_REVIEW_QUEUE_AVAILABLE) {
    return (
      <UnavailableScreen
        title="AI 검수 큐"
        description="AI가 자동 숨김 처리한 상품 · 콘텐츠를 운영자가 다시 확인합니다."
        message="AI 검수 큐는 준비 중이에요"
      />
    )
  }
  return <AiReviewQueuePage />
}

const targetTypeMeta: Record<AiReviewTargetType, StatusMeta> = {
  'product-image': { label: '상품 이미지', variant: 'neutral', icon: Image },
  'product-description': { label: '상품 설명', variant: 'neutral', icon: FileText },
  review: { label: '리뷰', variant: 'neutral', icon: MessageSquare },
  'sns-post': { label: 'SNS 게시물', variant: 'neutral', icon: Image },
}

const reviewStatusMeta: Record<AiReviewStatus, StatusMeta> = {
  pending: { label: '검수 대기', variant: 'neutral' },
  'auto-blinded': { label: '자동 블라인드', variant: 'muted' },
  'admin-approved': { label: '관리자 승인', variant: 'success' },
  'admin-rejected': { label: '관리자 반려', variant: 'error' },
  'admin-deleted': { label: '관리자 삭제', variant: 'danger' },
}

const targetTypeFilterOptions = [
  { value: 'all', label: '대상 유형 전체' },
  ...Object.entries(targetTypeMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const detectionReasonFilterOptions = [
  { value: 'all', label: '탐지 사유' },
  { value: '금지 콘텐츠', label: '금지 콘텐츠' },
  { value: '의약품성 표현', label: '의약품성 표현' },
  { value: '욕설/비방', label: '욕설/비방' },
  { value: '성인성 콘텐츠', label: '성인성 콘텐츠' },
  { value: '금칙어', label: '금칙어' },
]

const reviewStatusFilterOptions = [
  { value: 'all', label: '검수 상태' },
  ...Object.entries(reviewStatusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const processReasonOptions = [
  { value: 'banned-content', label: '금지 콘텐츠 · 효능 표현' },
  { value: 'abusive-language', label: '욕설/비방' },
  { value: 'adult-content', label: '성인성 콘텐츠' },
]

type AiReviewDecision = 'approve' | 'reject' | 'delete'

const decisionModalMeta: Record<
  AiReviewDecision,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    nextStatus: AiReviewStatus
    message: string
  }
> = {
  approve: {
    title: '검수를 승인할까요?',
    description: '승인 즉시 블라인드가 해제되고 콘텐츠가 다시 노출돼요.',
    confirmLabel: '승인',
    confirmVariant: 'primary',
    nextStatus: 'admin-approved',
    message: '검수를 승인했어요.',
  },
  reject: {
    title: '반려하고 수정 요청을 보낼까요?',
    description: '작성자/셀러에게 반려 사유가 통보되고 비노출이 유지돼요.',
    confirmLabel: '반려',
    confirmVariant: 'primary',
    nextStatus: 'admin-rejected',
    message: '반려하고 수정 요청을 보냈어요.',
  },
  delete: {
    title: '콘텐츠를 강제 삭제할까요?',
    description: '복구할 수 없어요. 작성자에게 통보되고 처리 내역은 액션 로그에 기록돼요.',
    confirmLabel: '삭제',
    confirmVariant: 'danger',
    nextStatus: 'admin-deleted',
    message: '콘텐츠를 삭제했어요.',
  },
}

function DetectionChip({ reason }: { reason: string }) {
  return (
    <Tag tone="warning">
      <AlertOctagon className="size-3" />
      {reason}
    </Tag>
  )
}

function StagePill({ stage }: { stage: AiReviewQueueItem['detectionStage'] }) {
  return <StatusPill variant={stage === 2 ? 'error' : 'warning'}>{stage}단계</StatusPill>
}

function makeQueueColumns(onOpenDetail: (row: AiReviewQueueItem) => void): Column<AiReviewQueueItem>[] {
  return [
    {
      key: 'targetType',
      label: '대상 유형',
      align: 'center',
      render: row => <StatusMetaPill meta={targetTypeMeta[row.targetType]} />,
    },
    {
      key: 'id',
      label: '대상 ID',
      render: row => (
        <RowLinkButton numeric onClick={() => onOpenDetail(row)}>
          {row.id}
        </RowLinkButton>
      ),
    },
    {
      key: 'detectionReason',
      label: '탐지 사유',
      align: 'center',
      render: row => <DetectionChip reason={row.detectionReason} />,
    },
    {
      key: 'detectionStage',
      label: '탐지 단계',
      align: 'center',
      render: row => <StagePill stage={row.detectionStage} />,
    },
    { key: 'sellerName', label: '셀러', render: row => row.sellerName ?? '—' },
    { key: 'productName', label: '상품', render: row => row.productName ?? '—' },
    {
      key: 'autoBlindedAt',
      label: '자동 블라인드',
      align: 'right',
      render: row => <span className="tabular-nums">{row.autoBlindedAt}</span>,
    },
    {
      key: 'reviewStatus',
      label: '검수 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={reviewStatusMeta[row.reviewStatus]} />,
    },
  ]
}

function AiReviewQueuePage() {
  const { data, isLoading } = useAiReviewQueueItems()
  const { items, patchRow, selected, select, closeDrawer, confirmOpen, setConfirmOpen, toast, setToast } =
    useDetailList(data)

  const [targetTypeFilter, setTargetTypeFilter] = useState('all')
  const [detectionReasonFilter, setDetectionReasonFilter] = useState('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (targetTypeFilter !== 'all' && row.targetType !== targetTypeFilter) return false
        if (detectionReasonFilter !== 'all' && row.detectionReason !== detectionReasonFilter) return false
        if (reviewStatusFilter !== 'all' && row.reviewStatus !== reviewStatusFilter) return false
        if (search && !row.id.includes(search)) return false
        return true
      }),
    [items, targetTypeFilter, detectionReasonFilter, reviewStatusFilter, search],
  )

  const [decision, setDecision] = useState<AiReviewDecision>('approve')
  const [processReason, setProcessReason] = useState('')
  const [sellerNotice, setSellerNotice] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AiReviewQueueItem) {
    select(row.id)
    setDecision(
      row.reviewStatus === 'admin-rejected'
        ? 'reject'
        : row.reviewStatus === 'admin-deleted'
          ? 'delete'
          : 'approve',
    )
    setProcessReason(row.processReason ?? '')
    setSellerNotice(row.sellerNotice ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function applyStatus(target: AiReviewQueueItem, nextStatus: AiReviewStatus, message: string) {
    patchRow(target.id, { reviewStatus: nextStatus, processReason, sellerNotice, internalMemo })
    setToast(message)
    closeDrawer()
  }

  const queueColumns = useMemo(() => makeQueueColumns(openDrawer), [])
  const decisionMeta = decisionModalMeta[decision]
  const processReasonLabel =
    processReasonOptions.find(opt => opt.value === processReason)?.label ?? processReason

  return (
    <div className="p-6">
      <PageIntro title="AI 검수 큐" description="AI가 자동 숨김 처리한 상품 · 콘텐츠를 운영자가 다시 확인합니다." />

      <FilterBar className="mb-3.5">
        <FilterSelect options={targetTypeFilterOptions} value={targetTypeFilter} onChange={setTargetTypeFilter} />
        <FilterSelect
          options={detectionReasonFilterOptions}
          value={detectionReasonFilter}
          onChange={setDetectionReasonFilter}
        />
        <FilterSelect
          narrow
          options={reviewStatusFilterOptions}
          value={reviewStatusFilter}
          onChange={setReviewStatusFilter}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="대상 ID 검색" className="w-56" />
      </FilterBar>

      <DataTable
        columns={queueColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 검수 대상이 없습니다."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="AI 검수 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${targetTypeMeta[selected.targetType].label}`}
            actions={
              <Button variant="primary" leftIcon={<Check className="size-4" />} onClick={() => setConfirmOpen(true)}>
                제출
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <ActorTag actor="ai" />
                  <DetectionChip reason={selected.detectionReason} />
                  <StagePill stage={selected.detectionStage} />
                </>
              }
            >
              {selected.aiReasoning && (
                <p className="flex items-start gap-1.5 text-body-sm text-text-secondary">
                  <Sparkles className="mt-0.5 size-3.5 flex-none text-brand" />
                  {selected.aiReasoning}
                </p>
              )}
            </DrawerSummaryCard>

            <DetailField label="대상 콘텐츠 미리보기">
              <MediaPlaceholder className="h-[150px] w-full">
                <Image className="size-8" />
              </MediaPlaceholder>
            </DetailField>

            <DetailField label="검수 이력">
              <HistoryList
                items={selected.reviewHistory}
                renderLabel={entry => (
                  <>
                    <ActorTag actor={entry.actor} />
                    {entry.label}
                  </>
                )}
              />
            </DetailField>

            <DetailField label="최종 처리 결과">
              <DecisionRadioGroup
                name="ai-queue-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'approve', label: '관리자 승인', caption: '블라인드 해제' },
                  { value: 'reject', label: '관리자 반려', caption: '수정 요청' },
                  { value: 'delete', label: '관리자 삭제', caption: '콘텐츠 강제 삭제' },
                ]}
              />
            </DetailField>

            <DetailField label="반려/삭제 사유">
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
                placeholder="셀러/작성자에게 전달할 안내 내용을 입력하세요."
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
          onConfirm={() => applyStatus(selected, decisionMeta.nextStatus, decisionMeta.message)}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: `${targetTypeMeta[selected.targetType].label} · ${selected.id}` },
              { label: '사유', value: processReasonLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

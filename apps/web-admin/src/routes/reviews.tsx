import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Eye, EyeOff, Image as ImageIcon, ImageOff, Trash2, VenetianMask } from 'lucide-react'
import {
  Alert,
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
import {
  BLIND_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  SELECTABLE_BLIND_REASONS,
  detailErrorMessage,
  isSelectableBlindReason,
  listErrorMessage,
  toDateTimeLabel,
  useAdminReviewDetail,
  useAdminReviews,
  useWriteReview,
  writeErrorMessage,
  type AdminReviewDetailView,
  type AdminReviewRow,
  type ReviewDecision,
  type ReviewStatusValue,
} from '@/features/reviews'
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

// `/admin/reviews` 다섯(목록·상세·블라인드·해제·삭제)이 dev에 올라와 실연동이다
// (SCRUM-319 / SCRUM-331). api 호스트의 `/reviews`는 구매자 본인 경로라 여기서 부르지 않는다.
export const Route = createFileRoute('/reviews')({
  component: ReviewsPage,
})

const statusMeta: Record<ReviewStatusValue, StatusMeta> = {
  public: { label: REVIEW_STATUS_LABELS.public, variant: 'success', icon: Eye },
  masked: { label: REVIEW_STATUS_LABELS.masked, variant: 'warning', icon: VenetianMask },
  blinded: { label: REVIEW_STATUS_LABELS.blinded, variant: 'muted', icon: EyeOff },
  hidden: { label: REVIEW_STATUS_LABELS.hidden, variant: 'muted', icon: EyeOff },
  deleted: { label: REVIEW_STATUS_LABELS.deleted, variant: 'danger', icon: Trash2 },
}

const statusFilterOptions: { value: ReviewStatusValue | 'all'; label: string }[] = [
  { value: 'all', label: '노출 상태 전체' },
  ...(Object.keys(statusMeta) as ReviewStatusValue[]).map(value => ({
    value,
    label: statusMeta[value].label,
  })),
]

/** 서버는 **정확한 별점 하나**만 받는다 — 1~2점 같은 구간은 계약에 없어 옵션을 별점별로 둔다. */
const ratingFilterOptions = [
  { value: 'all', label: '별점 전체' },
  { value: '5', label: '5점' },
  { value: '4', label: '4점' },
  { value: '3', label: '3점' },
  { value: '2', label: '2점' },
  { value: '1', label: '1점' },
]

/**
 * 신고 축은 상태와 직교한다 — 센티넬을 `'all'`로 두지 않는 이유는 어드민 목록 관례의 `'all'`이
 * "미선택"을 뜻해 **값이 둘뿐인 축**에서는 옵션 하나가 영원히 안 눌리는 모양이 되기 때문이다.
 */
const reportedFilterOptions = [
  { value: 'any', label: '신고 전체' },
  { value: 'reported', label: '신고 접수만' },
]

const blindReasonOptions = SELECTABLE_BLIND_REASONS.map(value => ({
  value,
  label: BLIND_REASON_LABELS[value],
}))

const decisionModalMeta: Record<
  ReviewDecision,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  blind: {
    title: '리뷰를 블라인드할까요?',
    description: '리뷰가 즉시 비노출되고 상품 평점에서 빠져요. 해제로 되돌릴 수 있어요.',
    confirmLabel: '블라인드',
    confirmVariant: 'primary',
  },
  unblind: {
    title: '블라인드를 해제할까요?',
    description: '리뷰가 다시 노출되고 상품 평점에 반영돼요.',
    confirmLabel: '블라인드 해제',
    confirmVariant: 'primary',
  },
  delete: {
    title: '리뷰를 삭제할까요?',
    description: '삭제된 리뷰는 되돌릴 수 없어요. 처리 사유는 운영 기록으로 남아요.',
    confirmLabel: '삭제',
    confirmVariant: 'danger',
  },
}

/**
 * 서버가 받아 주는 결정만 남긴다 — 나머지는 누르는 즉시 409·400으로 돌아온다.
 * 블라인드는 이미 가려진 리뷰에 다시 걸 수 없고(409/110020), 해제는 가려지지 않은 리뷰에
 * 쓸 수 없다(409/110021). 삭제된 리뷰는 종결이라 아무 전이도 받지 않는다(400/110002).
 */
function allowedDecisions(status: ReviewStatusValue): ReviewDecision[] {
  if (status === 'deleted') return []
  return status === 'blinded' ? ['unblind', 'delete'] : ['blind', 'delete']
}

function makeReviewColumns(
  onOpenDetail: (row: AdminReviewRow) => void,
): Column<AdminReviewRow>[] {
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
            {row.authorNickname}
            {row.authorWithdrawn && ' / 탈퇴'} / {row.productName}
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
            <ImageIcon className="size-3.5 text-icon-muted" />
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
      render: row => <span className="tabular-nums">{toDateTimeLabel(row.createdAt)}</span>,
    },
    {
      key: 'status',
      label: '노출 상태',
      // pill 아래 보조 텍스트가 붙는 컬럼은 center 금지(pill과 좌측이 어긋난다).
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={statusMeta[row.status]} />
          {row.blindReasonLabel && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">{row.blindReasonLabel}</p>
          )}
        </div>
      ),
    },
  ]
}

function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<ReviewStatusValue | 'all'>('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [reportedFilter, setReportedFilter] = useState('any')
  const [search, setSearch] = useState('')
  const list = useAdminReviews({
    status: statusFilter,
    rating: ratingFilter === 'all' ? 'all' : Number(ratingFilter),
    reportedOnly: reportedFilter === 'reported',
    keyword: search,
  })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detail = useAdminReviewDetail(selectedId)
  const write = useWriteReview()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [decision, setDecision] = useState<ReviewDecision>('blind')
  const [reasonCode, setReasonCode] = useState('')
  const [reasonText, setReasonText] = useState('')

  const review = detail.review
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 고른 값이 되돌아간다.
  useEffect(() => {
    if (!review) return
    setDecision(review.status === 'blinded' ? 'unblind' : 'blind')
    setReasonCode('')
    setReasonText('')
  }, [review?.reviewId])

  const allowed = review ? allowedDecisions(review.status) : []
  const needsReason = decision !== 'unblind'
  // 목록·상세 조회가 실패한 동안에는 처리를 잠근다(AGENTS 6-7). **상세도 함께 봐야 한다** —
  // react-query는 재조회가 실패해도 캐시된 상세를 돌려주므로, 상세만 403이 된 화면에서 낡은
  // 값으로 되돌릴 수 없는 삭제를 지시하게 된다.
  const canSubmit =
    review != null &&
    !write.isPending &&
    !list.isError &&
    !detail.isError &&
    allowed.includes(decision) &&
    (!needsReason || isSelectableBlindReason(reasonCode))

  function resetSelection() {
    setSelectedId(null)
    setConfirmOpen(false)
  }

  /**
   * 요청이 떠 있는 동안에는 **드로어도 확인 Modal도 닫지 않는다.**
   *
   * DS `Drawer`와 `Modal`은 ESC·스크림·취소를 모두 `onClose` 하나로 보낸다. 확인 버튼만
   * `loading`으로 잠그면 ESC 한 번에 드로어가 닫히고 그 과정에서 확인 Modal까지 함께 사라져,
   * 되돌릴 수 없는 처리가 날아가는 중에 화면이 비어 버린다 — 운영자는 그 처리가 들어갔는지 알 수
   * 없다. 그래서 닫기 제스처 전부를 이 가드로 모은다(성공·실패 뒤의 닫기는 아래 reset이 한다).
   */
  function closeDrawer() {
    if (write.isPending) return
    resetSelection()
  }

  function closeConfirm() {
    if (write.isPending) return
    setConfirmOpen(false)
  }

  function submit() {
    // 같은 버튼을 두 번 눌러도 요청은 한 번만 나간다.
    if (!review || write.isPending || !canSubmit) return
    write.mutate(
      {
        reviewId: review.reviewId,
        decision,
        reasonCode: needsReason && isSelectableBlindReason(reasonCode) ? reasonCode : null,
        reasonText,
      },
      {
        onSuccess: () => {
          setToast(`${decisionModalMeta[decision].confirmLabel} 처리했어요.`)
          resetSelection()
        },
        onError: error => {
          setToast(writeErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro title="리뷰 관리" description="등록된 리뷰를 확인하고 부적절한 리뷰를 숨겨요." />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "리뷰 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value => setStatusFilter(value as ReviewStatusValue | 'all')}
        />
        <FilterSelect
          options={ratingFilterOptions}
          value={ratingFilter}
          onChange={setRatingFilter}
          narrow
        />
        <FilterSelect
          options={reportedFilterOptions}
          value={reportedFilter}
          onChange={setReportedFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="리뷰 내용 / 상품 검색"
          className="w-64"
        />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 리뷰 {list.totalCount}건
          </span>
        )}
      </FilterBar>

      <DataTable
        columns={makeReviewColumns(row => setSelectedId(row.reviewId))}
        rows={list.rows}
        rowKey={row => String(row.reviewId)}
        onRowClick={row => setSelectedId(row.reviewId)}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 리뷰가 없어요.'}
      />

      {list.hasNext && (
        <div className="mt-3.5 flex justify-center">
          <Button
            variant="secondary"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="리뷰 상세" width="lg">
        {detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">리뷰 정보를 불러오고 있어요.</p>
        )}
        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {review && (
          <ReviewDetailBody
            review={review}
            allowed={allowed}
            decision={decision}
            onDecisionChange={setDecision}
            needsReason={needsReason}
            reasonCode={reasonCode}
            onReasonCodeChange={setReasonCode}
            reasonText={reasonText}
            onReasonTextChange={setReasonText}
            canSubmit={canSubmit}
            onSubmitClick={() => setConfirmOpen(true)}
          />
        )}
      </Drawer>

      {review && (
        <Modal
          open={confirmOpen}
          onClose={closeConfirm}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          confirmVariant={decisionModalMeta[decision].confirmVariant}
          onConfirm={submit}
          loading={write.isPending}
        >
          <SummaryGrid
            items={[
              { label: '작성자', value: review.authorNickname },
              {
                label: '처리 사유',
                value: needsReason
                  ? (isSelectableBlindReason(reasonCode)
                      ? BLIND_REASON_LABELS[reasonCode]
                      : '-')
                  : '해제는 사유를 받지 않아요',
              },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}

interface ReviewDetailBodyProps {
  review: AdminReviewDetailView
  allowed: ReviewDecision[]
  decision: ReviewDecision
  onDecisionChange: (value: ReviewDecision) => void
  needsReason: boolean
  reasonCode: string
  onReasonCodeChange: (value: string) => void
  reasonText: string
  onReasonTextChange: (value: string) => void
  canSubmit: boolean
  onSubmitClick: () => void
}

function ReviewDetailBody({
  review,
  allowed,
  decision,
  onDecisionChange,
  needsReason,
  reasonCode,
  onReasonCodeChange,
  reasonText,
  onReasonTextChange,
  canSubmit,
  onSubmitClick,
}: ReviewDetailBodyProps) {
  // 원문과 구매자에게 보이는 문장이 다른 경우는 마스킹된 리뷰뿐이다 — 같으면 한 번만 보여 준다.
  const masked = review.visibleContent !== review.content
  return (
    <DetailDrawerBody
      subtitle={`#${review.reviewId} / ${review.authorNickname}`}
      actions={
        <Button
          variant="primary"
          leftIcon={<Check className="size-4" />}
          onClick={onSubmitClick}
          disabled={!canSubmit}
        >
          제출
        </Button>
      }
    >
      <DrawerSummaryCard
        pills={
          <>
            <StatusMetaPill meta={statusMeta[review.status]} />
            {review.blindActor && <ActorTag actor={review.blindActor} />}
            {review.reportCount > 0 && (
              <StatusPill variant="warning">신고 {review.reportCount}건</StatusPill>
            )}
          </>
        }
      >
        <SummaryGrid
          items={[
            { label: '상품', value: review.productName },
            { label: '셀러', value: review.sellerName },
            { label: '옵션', value: review.optionName },
            { label: '작성 시각', value: toDateTimeLabel(review.createdAt) },
          ]}
        />
      </DrawerSummaryCard>

      <DetailField label="리뷰 내용">
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
          <RatingInput value={review.rating} readonly size={16} />
          <p className="mt-2 break-keep whitespace-pre-wrap text-body-sm text-text-secondary">
            {review.content}
          </p>
        </div>
      </DetailField>

      {/* 마스킹된 리뷰는 구매자가 보는 문장이 원문과 다르다 — 둘을 함께 봐야 판단할 수 있다. */}
      {masked && (
        <DetailField label="구매자에게 보이는 문장">
          <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
            {review.visibleContent}
          </p>
        </DetailField>
      )}

      <DetailField label={`첨부 사진 / ${review.photoCount}장`}>
        {review.imageUrls.length === 0 ? (
          <MediaPlaceholder className="h-[72px] w-full text-caption">
            <ImageOff className="mr-1.5 size-4" />
            첨부된 사진이 없어요.
          </MediaPlaceholder>
        ) : (
          <div className="flex flex-wrap gap-2">
            {review.imageUrls.map((url, index) => (
              <img
                key={url}
                src={url}
                alt={`리뷰 사진 ${index + 1}`}
                className="size-[72px] rounded-md object-cover"
              />
            ))}
          </div>
        )}
      </DetailField>

      <DetailField label={`신고 이력 / ${review.reports.length}건`}>
        <HistoryList items={review.reports} emptyLabel="접수된 신고가 없어요." />
      </DetailField>

      <DetailField label={`처리 이력 / ${review.actions.length}건`}>
        <HistoryList
          items={review.actions}
          renderDescription={() => review.blindReasonText}
          emptyLabel="처리 이력이 없어요."
        />
      </DetailField>

      <DetailField label="처리 결정">
        {allowed.length === 0 && (
          <Alert variant="info" title="이미 삭제된 리뷰예요" className="mb-2.5">
            <p>삭제는 되돌릴 수 없어서 블라인드도 해제도 할 수 없어요.</p>
          </Alert>
        )}
        <DecisionRadioGroup<ReviewDecision>
          name="review-decision"
          value={decision}
          onChange={onDecisionChange}
          options={[
            {
              value: 'blind',
              label: '블라인드',
              caption: allowed.includes('blind')
                ? '비노출, 되돌릴 수 있음'
                : '이미 블라인드된 리뷰예요',
              disabled: !allowed.includes('blind'),
            },
            {
              value: 'unblind',
              label: '블라인드 해제',
              caption: allowed.includes('unblind')
                ? '다시 노출하고 평점에 반영'
                : '블라인드된 리뷰만 풀 수 있어요',
              disabled: !allowed.includes('unblind'),
            },
            {
              value: 'delete',
              label: '삭제',
              caption: '되돌릴 수 없음',
              disabled: !allowed.includes('delete'),
            },
          ]}
        />
      </DetailField>

      {needsReason && (
        <>
          <DetailField label="처리 사유">
            <Select
              options={blindReasonOptions}
              value={reasonCode}
              onChange={onReasonCodeChange}
              placeholder="사유 선택"
            />
          </DetailField>

          <DetailField label="처리 사유 메모" visibility="internal-only">
            <Textarea
              value={reasonText}
              onChange={onReasonTextChange}
              maxLength={500}
              rows={3}
              placeholder="운영 기록으로 남길 메모를 입력하세요."
            />
          </DetailField>
        </>
      )}
    </DetailDrawerBody>
  )
}

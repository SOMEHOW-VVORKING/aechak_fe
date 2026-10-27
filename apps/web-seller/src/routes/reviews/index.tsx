import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Alert,
  Button,
  FilterBar,
  MetricCard,
  PageHeader,
  Select,
  Skeleton,
} from '@aechak/design-system/web'
import {
  RatingSummaryPanel,
  ReviewReplyList,
  RATING_VALUES,
  REPLY_FILTER_DONE,
  REPLY_FILTER_NONE,
  pendingReplyReviewId,
  reviewErrorMessage,
  useDeleteReviewReply,
  useEditReviewReply,
  useReviewProductOptions,
  useSellerReviews,
  useUnansweredReviewCount,
  useWriteReviewReply,
  type SellerReview,
  type SellerReviewSearchInput,
} from '@/features/reviews'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/reviews/')({
  component: ReviewsRoute,
})

/**
 * 리뷰 관리 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307이 예시 데이터로 화면을 채웠고, SCRUM-315에서 seller 호스트에
 * `GET /sellers/me/reviews`와 답글 경로(POST/PUT/DELETE)가 열려 **실서버로 바꿨다**.
 * 그래서 예시 데이터 띠와 `*.mock.ts`를 지웠고 nav의 "준비 중" 꼬리표도 떼었다.
 *
 * 목록은 커서 페이지네이션이라 "더 보기"로 이어 붙인다(오프셋 페이지 버튼이 아니다 — 서버에
 * page 파라미터가 없다).
 */

const ALL = ''

const RATING_OPTIONS = [
  { value: ALL, label: '전체 별점' },
  ...RATING_VALUES.map(rating => ({ value: String(rating), label: `${rating}점` })),
]

const REPLY_OPTIONS = [
  { value: ALL, label: '답글 전체' },
  { value: REPLY_FILTER_NONE, label: '답글 없음' },
  { value: REPLY_FILTER_DONE, label: '답글 완료' },
]

const EMPTY_FILTERS: SellerReviewSearchInput = { productId: ALL, rating: ALL, reply: ALL }

function ReviewsRoute() {
  const [filters, setFilters] = useState<SellerReviewSearchInput>(EMPTY_FILTERS)
  const toast = useToast()

  const listQuery = useSellerReviews(filters)
  const { view, isLoading, isError, error, isFetching, hasNextPage, isFetchingNextPage } = listQuery

  // 답글 없는 건수는 목록과 같은 경로를 답글 없음 필터로 한 건만 불러 totalCount를 읽는다.
  // 상품 필터는 같이 걸어 목록과 어긋나지 않게 한다.
  const unansweredQuery = useUnansweredReviewCount({ productId: filters.productId })
  const productOptionsQuery = useReviewProductOptions()

  const writeReply = useWriteReviewReply()
  const editReply = useEditReviewReply()
  const deleteReply = useDeleteReviewReply()
  // 끝난 mutation의 variables가 남아 엉뚱한 행을 잠그지 않도록 판정은 한 곳에 모아 둔다.
  const pendingReviewId = pendingReplyReviewId([writeReply, editReply, deleteReply])

  const productOptions = useMemo(
    () => [{ value: ALL, label: '전체 상품' }, ...(productOptionsQuery.data ?? [])],
    [productOptionsQuery.data],
  )

  const setFilter = (patch: Partial<SellerReviewSearchInput>) =>
    setFilters(prev => ({ ...prev, ...patch }))

  const onSubmit = (review: SellerReview, content: string) => {
    const mutation = review.reply == null ? writeReply : editReply
    const done = review.reply == null ? '답글을 등록했어요.' : '답글을 수정했어요.'
    mutation.mutate(
      { reviewId: review.reviewId, content },
      {
        onSuccess: () => toast.show(done),
        onError: cause => toast.show(reviewErrorMessage(cause), 'error'),
      },
    )
  }

  const onDelete = (review: SellerReview) =>
    deleteReply.mutate(
      { reviewId: review.reviewId },
      {
        onSuccess: () => toast.show('답글을 지웠어요.'),
        onError: cause => toast.show(reviewErrorMessage(cause), 'error'),
      },
    )

  const hasRows = view.reviews.length > 0

  return (
    <div className="p-6">
      <PageHeader title="리뷰 관리" />

      {/* 목록 조회 실패를 "조건에 맞는 리뷰가 없어요"로 흘리지 않는다 — 실 API에는 403/110011(탈퇴·정지
          셀러), 403/20006(온보딩 미완), 400/90002(커서), 500이 모두 있고 그 전부가 빈 상태로 보이면
          셀러는 필터를 의심한다(AGENTS.md 규약 7). 재조회 실패 시에는 직전 데이터가 남으므로 그
          사실도 함께 밝힌다. */}
      {isError && (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {reviewErrorMessage(error)}
              {hasRows && ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching}
              onClick={() => void listQuery.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : (
        view.summary != null && <RatingSummaryPanel summary={view.summary} />
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="답글 없는 리뷰"
          value={unansweredQuery.data == null ? '—' : `${unansweredQuery.data.toLocaleString()}건`}
          variant={(unansweredQuery.data ?? 0) > 0 ? 'urgent' : 'default'}
        />
        <MetricCard
          label="전체 리뷰"
          value={view.summary == null ? '—' : `${view.summary.reviewCount.toLocaleString()}건`}
          variant="quiet"
        />
      </div>

      <FilterBar className="mt-4">
        <Select
          aria-label="상품"
          options={productOptions}
          value={filters.productId ?? ALL}
          onChange={value => setFilter({ productId: value })}
        />
        <Select
          aria-label="별점"
          options={RATING_OPTIONS}
          value={filters.rating ?? ALL}
          onChange={value => setFilter({ rating: value })}
        />
        <Select
          aria-label="답글 여부"
          options={REPLY_OPTIONS}
          value={filters.reply ?? ALL}
          onChange={value => setFilter({ reply: value })}
        />
        <Button variant="ghost" size="md" onClick={() => setFilters(EMPTY_FILTERS)}>
          초기화
        </Button>
      </FilterBar>

      {/* 총건수는 첫 페이지에만 실린다 — 서버가 뒤 페이지에서 null을 준다. */}
      <p className="mt-4 text-caption text-text-tertiary">
        총 {view.totalCount == null ? '—' : view.totalCount.toLocaleString()}건
        {view.totalCount != null && hasRows && view.reviews.length < view.totalCount && (
          <span className="ml-2">{view.reviews.length}건 보고 있어요.</span>
        )}
      </p>

      <div className="mt-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ReviewReplyList
            reviews={view.reviews}
            onSubmit={onSubmit}
            onDelete={onDelete}
            pendingReviewId={pendingReviewId}
            // 조회가 실패해 들고 있는 행이 없으면 "조건에 맞는 리뷰가 없어요"를 띄우지 않는다 —
            // 실패를 빈 결과로 흘리면 셀러가 필터를 의심한다(위 Alert이 이유를 말한다).
            hideEmptyState={isError}
            // 조회가 실패한 동안에는 그 데이터로 하는 처리를 잠근다 — 폼은 낡은 행의 값으로 만들어진다.
            locked={isError}
          />
        )}
      </div>

      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="md"
            loading={isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            더 보기
          </Button>
        </div>
      )}

      <p className="mt-3.5 text-caption text-text-tertiary">
        답글은 구매자와 다른 방문자 모두에게 보여요. 답글은 리뷰 하나에 하나이고, 구매자가 리뷰를
        지우면 답글도 함께 사라져요.
      </p>

      {toast.element}
    </div>
  )
}

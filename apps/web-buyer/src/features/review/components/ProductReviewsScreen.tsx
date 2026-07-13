import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import type { Review } from '@aechak/domain'
import {
  EmptyState,
  MobileScreen,
  Modal,
  RatingInput,
  ReviewCard,
  Skeleton,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useAccount } from '@/shared/account'
import { useDeleteReview, useProductReviews, type ProductReviewsView } from '../review.queries'
import { REVIEW_SORTS, sortReviews, type ReviewSort } from '../review.mock'
import { MyReviewCard } from './MyReviewCard'

// 상품 리뷰 목록(b4-st-3). 별점 분포 + 정렬(최신순/별점높은순/포토리뷰만) + 리뷰 카드 목록.
export function ProductReviewsScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { data, isLoading } = useProductReviews(productId)
  const [sort, setSort] = useState<ReviewSort>('latest')

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/products/$productId', params: { productId } })
  }

  const title = data ? `리뷰 ${data.total.toLocaleString('ko-KR')}` : '리뷰'

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title={title} />}>
      {isLoading ? (
        <ReviewsSkeleton />
      ) : !data ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="상품을 찾을 수 없어요"
            description="삭제되었거나 주소가 올바르지 않은 상품이에요."
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      ) : (
        <ReviewsBody data={data} sort={sort} onSort={setSort} />
      )}
    </MobileScreen>
  )
}

function ReviewsBody({
  data,
  sort,
  onSort,
}: {
  data: ProductReviewsView
  sort: ReviewSort
  onSort: (s: ReviewSort) => void
}) {
  const navigate = useNavigate()
  const { nickname } = useAccount()
  const deleteReview = useDeleteReview()
  const visible = sortReviews(data.reviews, sort)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string }>({ open: false, message: '' })

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteReview.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        setToast({ open: true, message: '리뷰를 삭제했어요.' })
      },
    })
  }

  return (
    <div className="flex flex-col">
      {/* 평점 요약 */}
      <div className="flex items-center gap-5 border-b border-border-subtle p-4">
        <div className="flex flex-none flex-col items-center gap-1">
          <span className="text-display font-bold leading-none text-text-primary">
            {data.average.toFixed(1)}
          </span>
          <RatingInput value={data.average} readonly size={14} />
          <span className="text-caption text-text-tertiary">{data.total.toLocaleString('ko-KR')}개</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {data.distribution.map((pct, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 flex-none text-caption text-text-tertiary">{5 - i}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 정렬/필터 칩 */}
      <div className="flex gap-2 px-4 py-3" role="tablist" aria-label="리뷰 정렬">
        {REVIEW_SORTS.map(option => {
          const active = option.value === sort
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSort(option.value)}
              className={[
                'h-8 rounded-chip border px-3 text-body-sm transition-colors',
                active
                  ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
                  : 'border-border bg-surface-base text-text-secondary',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {/* 정렬 칩 아래 두꺼운 sunken 구분 바(item 6)는 제거했다 — 정렬 칩과 목록 사이 여백만 유지. */}

      {/* 리뷰 목록 */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
          <p className="text-body-sm text-text-secondary">조건에 맞는 리뷰가 없어요</p>
          <p className="text-caption text-text-tertiary">다른 정렬을 선택해 보세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {visible.map(review =>
            review.isMine ? (
              // 내가 쓴 리뷰: 작성자를 닉네임으로 표기하고 우측에 수정/삭제를 노출한다.
              <MyReviewCard
                key={review.id}
                review={review}
                nickname={nickname}
                onEdit={() => navigate({ to: '/reviews/write', search: { reviewId: review.id } })}
                onDelete={() => setDeleteTarget(review)}
                onImageOpen={setLightboxSrc}
              />
            ) : (
              <ReviewCard
                key={review.id}
                author={review.author}
                rating={review.rating}
                date={review.createdAt.slice(5)}
                content={review.content}
                images={review.images.length > 0 ? review.images : undefined}
                onImageClick={
                  review.images.length > 0
                    ? index => setLightboxSrc(review.images[index] ?? null)
                    : undefined
                }
              />
            ),
          )}
        </div>
      )}

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} alt="리뷰 사진" />

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="리뷰를 삭제할까요?"
        description="삭제하면 되돌릴 수 없고 지급된 적립금이 회수될 수 있어요."
        confirmLabel="삭제하기"
        cancelLabel="닫기"
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleteReview.isPending}
      />

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant="success"
      />
    </div>
  )
}

function ReviewsSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton variant="rect" className="h-24 w-full rounded-card" />
      <Skeleton variant="text" className="h-8 w-1/2" />
      <Skeleton variant="rect" className="h-28 w-full rounded-card" />
      <Skeleton variant="rect" className="h-28 w-full rounded-card" />
    </div>
  )
}

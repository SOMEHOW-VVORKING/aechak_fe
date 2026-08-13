import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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
import { useSafeBack } from '@/shared/useSafeBack'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useAccount } from '@/shared/account'
import { useDeleteReview, useProductReviews, type ProductReviewsView } from '../review.queries'
import { REVIEW_SORTS, type ReviewSort } from '../review.mock'
import { MyReviewCard } from './MyReviewCard'

// 상품 리뷰 목록(b4-st-3). 별점 분포 + 정렬(최신순/별점높은순) + 포토리뷰만 필터 + 리뷰 카드 목록.
// 정렬(2종)과 포토리뷰만(불리언)은 서버 계약대로 분리한 상태로 API에 파라미터로 넘긴다.
export function ProductReviewsScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<ReviewSort>('latest')
  const [photoOnly, setPhotoOnly] = useState(false)
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useProductReviews(productId, sort, photoOnly)

  const goBack = useSafeBack({ to: '/products/$productId', params: { productId } })

  // 헤더 라벨은 현재 필터(photoOnly)를 반영한 목록 개수를 쓴다 — 요약 카드의 전체 집계와 달리
  // 목록과 숫자가 어긋나지 않게 한다.
  const title = data ? `리뷰 ${data.filteredTotal.toLocaleString('ko-KR')}` : '리뷰'

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title={title} />}>
      {isLoading ? (
        <ReviewsSkeleton />
      ) : isError && !data ? (
        // 최초 로딩 실패만 에러 화면으로 전환한다 — 이미 불러온 목록이 있는데 "더보기"(다음 페이지)가
        // 실패하면 query.isError가 켜져도 목록을 통째로 에러 화면으로 교체하지 않고 그대로 유지한다
        // (다음 페이지는 더보기 버튼으로 재시도된다). 인증 실패는 인터셉터가 전역에서 로그인으로
        // 보내고, 비인증 실패(네트워크/500)는 화면마다 재시도 버튼을 떠안지 않고 안내만 한다(breeds 컨벤션).
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="리뷰를 불러오지 못했어요"
            description="네트워크 상태를 확인하고 잠시 후 다시 들어와 주세요."
          />
        </div>
      ) : !data ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="상품을 찾을 수 없어요"
            description="삭제되었거나 주소가 올바르지 않은 상품이에요."
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      ) : (
        <ReviewsBody
          data={data}
          sort={sort}
          onSort={setSort}
          photoOnly={photoOnly}
          onPhotoOnlyChange={setPhotoOnly}
          hasNextPage={hasNextPage}
          onLoadMore={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      )}
    </MobileScreen>
  )
}

function ReviewsBody({
  data,
  sort,
  onSort,
  photoOnly,
  onPhotoOnlyChange,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: {
  data: ProductReviewsView
  sort: ReviewSort
  onSort: (s: ReviewSort) => void
  photoOnly: boolean
  onPhotoOnlyChange: (v: boolean) => void
  hasNextPage: boolean
  onLoadMore: () => void
  isFetchingNextPage: boolean
}) {
  const navigate = useNavigate()
  const { nickname } = useAccount()
  const deleteReview = useDeleteReview()
  // 정렬/포토 필터는 서버가 적용한다 — 여기서 다시 정렬하지 않고 훅이 준 순서 그대로 그린다.
  const visible = data.reviews
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

      {/* 정렬 칩(최신순/별점높은순, 배타) + 포토리뷰만 토글(독립). 서버 계약대로 정렬과 필터를 분리한다. */}
      <div className="flex gap-2 px-4 py-3">
        <div className="flex gap-2" role="group" aria-label="리뷰 정렬">
          {REVIEW_SORTS.map(option => {
            const active = option.value === sort
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onSort(option.value)}
                className={chipClass(active)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-pressed={photoOnly}
          onClick={() => onPhotoOnlyChange(!photoOnly)}
          className={chipClass(photoOnly)}
        >
          포토리뷰만
        </button>
      </div>

      {/* 정렬 칩 아래 두꺼운 sunken 구분 바는 제거했다 — 정렬 칩과 목록 사이 여백만 유지. */}

      {/* 리뷰 목록 */}
      {visible.length === 0 ? (
        // 비어 있는 원인을 실제 필터에 맞춰 안내한다 — 포토리뷰만 필터가 원인이면 그걸 끄라고,
        // 아니면 아직 리뷰가 없는 것이라고. 정렬은 목록을 비우지 않으므로 "다른 정렬" 안내는 쓰지 않는다.
        <div className="flex flex-col items-center gap-1.5 px-4 py-12 text-center">
          {photoOnly ? (
            <>
              <p className="text-body-sm text-text-secondary">사진이 있는 리뷰가 없어요</p>
              <p className="text-caption text-text-tertiary">포토리뷰만 필터를 끄면 전체 리뷰를 볼 수 있어요.</p>
            </>
          ) : (
            <>
              <p className="text-body-sm text-text-secondary">아직 등록된 리뷰가 없어요</p>
              <p className="text-caption text-text-tertiary">첫 리뷰를 기다리고 있어요.</p>
            </>
          )}
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

      {hasNextPage && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="h-11 w-full rounded-button border border-border bg-surface-base text-body-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
          >
            {isFetchingNextPage ? '불러오는 중…' : '더보기'}
          </button>
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

// 정렬/필터 칩 공용 스타일 — 활성(brand subtle) / 비활성(중립) 두 상태.
function chipClass(active: boolean): string {
  return [
    'h-8 rounded-chip border px-3 text-body-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
    active
      ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
      : 'border-border bg-surface-base text-text-secondary',
  ].join(' ')
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

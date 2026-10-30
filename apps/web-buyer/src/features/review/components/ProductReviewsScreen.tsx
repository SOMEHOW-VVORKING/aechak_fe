import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Review } from '@aechak/domain'
import { MobileScreen, Modal, ReviewCard, Skeleton } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { FilterChip } from '@/shared/components/FilterChip'
import { RatingDistribution } from '@/shared/components/RatingDistribution'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useAccount } from '@/shared/account'
import {
  reviewErrorMessage,
  serverReviewId,
  useDeleteReview,
  useProductReviews,
  type ProductReviewsView,
} from '../review.queries'
import { REVIEW_SORTS, type ReviewSort } from '../review.mock'
import { LoadMoreButton } from './LoadMoreButton'
import { MyReviewCard } from './MyReviewCard'
import { SellerReplyNote } from './SellerReplyNote'

// 상품 리뷰 목록(b4-st-3). 별점 분포 + 정렬(최신순/별점높은순) + 포토리뷰만 필터 + 리뷰 카드 목록.
// 정렬(2종)과 포토리뷰만(불리언)은 서버 계약대로 분리한 상태로 API에 파라미터로 넘긴다.
export function ProductReviewsScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<ReviewSort>('latest')
  const [photoOnly, setPhotoOnly] = useState(false)
  const {
    data,
    isLoading,
    isError,
    isPlaceholderData,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProductReviews(productId, sort, photoOnly)

  // 기본 필터(최신순 + 포토 off)에서 실패했으면 되돌릴 상태 자체가 없다.
  const isDefaultFilter = sort === 'latest' && !photoOnly

  const goBack = useSafeBack({ to: '/products/$productId', params: { productId } })

  // 헤더 라벨은 현재 필터(photoOnly)를 반영한 목록 개수를 쓴다 — 요약 카드의 전체 집계와 달리
  // 목록과 숫자가 어긋나지 않게 한다.
  const title = data ? `리뷰 ${data.filteredTotal.toLocaleString('ko-KR')}` : '리뷰'

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title={title} />}>
      {isLoading ? (
        <ReviewsSkeleton />
      ) : isError && (!data || isPlaceholderData) ? (
        // 최초 로딩 실패(!data)와 정렬/포토 토글 실패(isPlaceholderData)만 에러 화면으로 전환한다.
        // 토글 실패 시 placeholderData가 이전 필터의 목록을 그대로 들고 있어(data가 truthy) 그냥 두면
        // "칩은 새 필터로 활성인데 목록은 이전 필터 그대로"인 조용한 오동작이 된다 — 이때는 stale 목록을
        // 보여주지 않고 에러로 안내한다(사용자가 칩을 되돌리면 캐시된 이전 목록이 즉시 다시 뜬다).
        // 반면 이미 불러온 목록이 있는데 "더보기"(다음 페이지)가 실패하면 isPlaceholderData가 아니라
        // 실제 data라 목록을 통째로 에러 화면으로 교체하지 않고 그대로 유지한다(더보기 버튼으로 재시도).
        // 인증 실패는 인터셉터가 전역에서 로그인으로 보내고, 비인증 실패(네트워크/500)는 화면마다
        // 재시도 버튼을 떠안지 않고 안내만 한다(breeds 컨벤션).
        // 단 정렬/포토 칩은 이 에러 화면에 없으므로(칩이 ReviewsBody 안에 있다) 위 주석이 말한
        // "칩을 되돌리면 캐시된 목록이 다시 뜬다"를 사용자가 실행할 수단이 없다 — 기본 필터가
        // 아닌 상태에서 실패했을 때만 기본으로 되돌리는 길을 준다(재시도가 아니라 상태 복원).
        <ScreenEmptyState
          title="리뷰를 불러오지 못했어요"
          description="네트워크 상태를 확인하고 잠시 후 다시 들어와 주세요."
          action={
            isDefaultFilter
              ? undefined
              : {
                  label: '최신순으로 보기',
                  onClick: () => {
                    setSort('latest')
                    setPhotoOnly(false)
                  },
                }
          }
        />
      ) : !data ? (
        <ScreenEmptyState
          title="상품을 찾을 수 없어요"
          description="삭제되었거나 주소가 올바르지 않은 상품이에요."
          action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
        />
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
  const [toast, setToast] = useState<{
    open: boolean
    message: string
    variant: 'success' | 'error'
  }>({
    open: false,
    message: '',
    variant: 'success',
  })

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteReview.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null)
        setToast({ open: true, message: '리뷰를 삭제했어요.', variant: 'success' })
      },
      // 403(본인 리뷰 아님) 등 서버가 거절한 사유를 조용히 삼키지 않고 그대로 알린다.
      onError: error => {
        setDeleteTarget(null)
        setToast({ open: true, message: reviewErrorMessage(error), variant: 'error' })
      },
    })
  }

  return (
    <div className="flex flex-col">
      {/* 평점 요약 */}
      <RatingDistribution
        average={data.average}
        total={data.total}
        distribution={data.distribution}
        className="gap-5 border-b border-border-subtle p-4"
      />

      {/* 정렬 칩(최신순/별점높은순, 배타) + 포토리뷰만 토글(독립). 서버 계약대로 정렬과 필터를 분리한다. */}
      <div className="flex gap-2 px-4 py-3">
        <div className="flex gap-2" role="group" aria-label="리뷰 정렬">
          {REVIEW_SORTS.map(option => (
            <FilterChip
              key={option.value}
              size="sm"
              selected={option.value === sort}
              onClick={() => onSort(option.value)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
        <FilterChip size="sm" selected={photoOnly} onClick={() => onPhotoOnlyChange(!photoOnly)}>
          포토리뷰만
        </FilterChip>
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
              <p className="text-caption text-text-tertiary">
                포토리뷰만 필터를 끄면 전체 리뷰를 볼 수 있어요.
              </p>
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
          {visible.map(review => (
            // 답글은 카드 바깥에 덧붙인다 — 두 카드가 각자 chrome을 그려 안에 넣을 자리가 없다.
            <div key={review.id} className="flex flex-col gap-2">
              {review.isMine ? (
                // 내가 쓴 리뷰: 작성자를 닉네임으로 표기하고 우측에 수정/삭제를 노출한다.
                <MyReviewCard
                  review={review}
                  nickname={nickname}
                  // 수정은 서버 API가 없어 로컬 스토어 리뷰에서만 가능하다 — 서버에서 온 리뷰는
                  // 스토어에 없어 작성 화면이 대상을 못 찾으므로 버튼을 아예 내리고 삭제만 남긴다.
                  onEdit={
                    serverReviewId(review.id) == null
                      ? () => navigate({ to: '/reviews/write', search: { reviewId: review.id } })
                      : undefined
                  }
                  onDelete={() => setDeleteTarget(review)}
                  onImageOpen={setLightboxSrc}
                />
              ) : (
                <ReviewCard
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
              )}
              <SellerReplyNote reply={review.sellerReply} />
            </div>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="px-4 pb-4">
          <LoadMoreButton onClick={onLoadMore} loading={isFetchingNextPage} />
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
        variant={toast.variant}
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

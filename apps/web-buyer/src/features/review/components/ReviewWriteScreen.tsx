import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Image as ImageIcon } from 'lucide-react'
import type { Review } from '@aechak/domain'
import {
  Alert,
  BottomFixedAction,
  EmptyState,
  MobileScreen,
  PhotoUpload,
  RatingInput,
  Textarea,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { findProduct, placeholderImage } from '@/shared/catalog'
import { useOrders } from '@/shared/order'
import { reviewErrorMessage, useCreateReview, useEditReview, useReviewById } from '../review.queries'
import { MAX_REVIEW_LENGTH, MIN_REVIEW_LENGTH, REVIEW_REWARD, validateReview } from '../review.mock'
import {
  isSupportedReviewPhoto,
  isWithinReviewPhotoSizeLimit,
  MAX_REVIEW_PHOTOS,
  OVERSIZED_REVIEW_PHOTO_MESSAGE,
  UNSUPPORTED_REVIEW_PHOTO_MESSAGE,
} from '../review.upload'

export interface ReviewWriteScreenProps {
  productId?: string
  orderId?: string
  /** 수정 진입 시 대상 리뷰 id(있으면 프리필 + 수정 모드). */
  reviewId?: string
}

/** 서버에서 받은 표시용 URL은 놓아주면 안 되고, 로컬 미리보기 blob만 해제한다(펫 폼과 동일). */
function revokeIfBlob(url: string) {
  if (url.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

const RATING_WORDS = ['', '별로예요', '그저 그래요', '괜찮아요', '좋아요', '최고예요']

// 리뷰 작성(b4-st-2). 별점·사진·본문 + 최소 글자/금칙어 검증. 등록 → 내 리뷰로 이동(토스트).
export function ReviewWriteScreen({ productId, orderId, reviewId }: ReviewWriteScreenProps) {
  const navigate = useNavigate()
  const editing = useReviewById(reviewId)
  const orders = useOrders()
  const createReview = useCreateReview()
  const editReview = useEditReview()

  // 수정 모드면 리뷰가 대상, 아니면 search param이 대상.
  const targetProductId = editing?.productId ?? productId ?? ''
  const targetOrderId = editing?.orderId ?? orderId ?? ''

  const product = findProduct(targetProductId)
  const orderItem = orders
    .find(o => o.id === targetOrderId)
    ?.groups.flatMap(g => g.items)
    .find(i => i.productId === targetProductId)
  const productName = orderItem?.name ?? product?.name
  const productOption = orderItem?.option ?? product?.category ?? '기본 구성'
  const thumbnail = orderItem?.thumbnailUrl ?? product?.thumbnailUrl

  const [rating, setRating] = useState(editing?.rating ?? 0)
  const [content, setContent] = useState(editing?.content ?? '')
  // 미리보기 URL과 원본 File을 짝으로 들고 있는다 — 서버 경로는 제출 시점에 File을 presigned
  // 업로드해야 하고, 수정 진입으로 프리필된 기존 사진은 URL만 있어 file이 없다.
  const [photos, setPhotos] = useState<{ url: string; file?: File }[]>(
    (editing?.images ?? []).map(url => ({ url })),
  )
  const [photoError, setPhotoError] = useState<string | null>(null)
  const images = photos.map(p => p.url)

  const goBack = useSafeBack({ to: '/reviews/mine', search: { submitted: false } })

  const validation = validateReview(rating, content)
  const submitting = createReview.isPending || editReview.isPending
  // 본문을 입력했는데 무효(너무 짧음/금칙어)일 때만 에러를 노출한다(입력 전엔 안내만).
  const showError =
    content.trim().length > 0 && !validation.ok && validation.reason !== 'rating'

  const handleSubmit = () => {
    if (!validation.ok) return
    if (editing) {
      editReview.mutate(
        { id: editing.id, patch: { rating: rating as Review['rating'], content, images } },
        {
          // 결제 결과 화면과 동일 — 수정 완료 후 히스토리에서 작성/수정 화면을 빼서
          // 뒤로가기가 이 화면을 재진입(프리필된 폼 재노출)하지 않게 한다.
          onSuccess: () =>
            navigate({ to: '/reviews/mine', search: { submitted: true }, replace: true }),
        },
      )
      return
    }
    const review: Review = {
      id: `rv-${targetOrderId}-${targetProductId}`,
      productId: targetProductId,
      orderId: targetOrderId,
      author: '나',
      rating: rating as Review['rating'],
      content: content.trim(),
      images,
      option: productOption,
      verifiedPurchase: true,
      createdAt: '2026.07.10',
    }
    createReview.mutate(
      // orderItemId는 실 주문에만 있다 — 없으면 mutation이 로컬 스토어 경로로 폴백한다.
      { review, orderItemId: orderItem?.orderItemId, files: photos.flatMap(p => (p.file ? [p.file] : [])) },
      {
        onSuccess: () =>
          navigate({ to: '/reviews/mine', search: { submitted: true }, replace: true }),
      },
    )
  }

  const handleAddPhotos = (files: File[]) => {
    // presigned PUT은 S3 직행이라 서버가 형식·크기를 못 막는다 — 발급 전에 여기서 걸러 안내한다.
    if (files.some(file => !isSupportedReviewPhoto(file))) {
      setPhotoError(UNSUPPORTED_REVIEW_PHOTO_MESSAGE)
      return
    }
    if (files.some(file => !isWithinReviewPhotoSizeLimit(file))) {
      setPhotoError(OVERSIZED_REVIEW_PHOTO_MESSAGE)
      return
    }
    // 상한을 넘는 파일은 URL을 만들기 전에 자른다 — 먼저 만들고 slice로 버리면 그 blob이
    // 참조를 잃은 채 문서가 닫힐 때까지 남는다. 잘린 이유도 말없이 두지 않고 알린다.
    const room = Math.max(0, MAX_REVIEW_PHOTOS - photos.length)
    const accepted = files.slice(0, room)
    setPhotoError(
      files.length > accepted.length
        ? `사진은 최대 ${MAX_REVIEW_PHOTOS}장까지 올릴 수 있어요`
        : null,
    )
    if (accepted.length === 0) return
    const added = accepted.map((file, i) => ({
      file,
      url:
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : placeholderImage(200 + i * 40),
    }))
    setPhotos(prev => [...prev, ...added])
  }

  // 목록에서 뺀 사진의 blob만 해제한다. 미제출 이탈 시 일괄 해제는 하지 않는다 — 목업 주문
  // 경로는 이 blob URL을 그대로 리뷰 스토어에 저장해 내 리뷰 화면에서 다시 그리므로,
  // 언마운트에서 놓아주면 방금 쓴 리뷰의 사진이 깨진다(수정 진입으로 프리필된 서버 URL도 동일).
  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => {
      const target = prev[index]
      if (target?.file) revokeIfBlob(target.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  if (!productName) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="리뷰 작성" />}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="리뷰할 상품을 찾을 수 없어요"
            description="주소가 올바르지 않거나 삭제된 상품이에요."
            action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
          />
        </div>
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="리뷰 작성" />}
      footer={
        <BottomFixedAction
          primary={{
            label: editing ? '리뷰 수정' : '리뷰 등록',
            onClick: handleSubmit,
            disabled: !validation.ok,
            loading: submitting,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        {/* 상품 요약 */}
        <div className="flex items-center gap-3">
          <div className="size-12 flex-none overflow-hidden rounded-image bg-surface-sunken">
            {thumbnail ? (
              <img src={thumbnail} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-icon-muted">
                <ImageIcon className="size-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-body-sm text-text-primary">{productName}</p>
            <p className="mt-0.5 text-caption text-text-tertiary">{productOption}</p>
          </div>
        </div>

        {/* 별점 */}
        <div className="flex flex-col items-center gap-2 py-1">
          <span className="text-label text-text-secondary">상품은 만족하셨나요?</span>
          <RatingInput value={rating} onChange={setRating} />
          {rating > 0 && <span className="text-caption text-text-secondary">{RATING_WORDS[rating]}</span>}
        </div>

        {/* 본문 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-label font-medium text-text-secondary">리뷰 내용</span>
            <span className="text-caption text-text-tertiary">최소 {MIN_REVIEW_LENGTH}자</span>
          </div>
          <Textarea
            value={content}
            onChange={setContent}
            maxLength={MAX_REVIEW_LENGTH}
            rows={5}
            state={showError ? 'error' : 'default'}
            helperText={showError && !validation.ok ? validation.message : undefined}
            placeholder="상품은 어떠셨나요? 다른 구매자에게 도움이 되는 후기를 남겨 주세요."
          />
        </div>

        {/* 사진 첨부 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-secondary">
            사진 첨부 <span className="text-caption text-text-tertiary">(선택)</span>
          </span>
          <PhotoUpload
            photos={images}
            onAdd={handleAddPhotos}
            onRemove={handleRemovePhoto}
            max={MAX_REVIEW_PHOTOS}
          />
          {photoError && (
            <p role="alert" className="text-caption text-error-fg">
              {photoError}
            </p>
          )}
        </div>

        {/* 등록 실패 — 401은 인터셉터가 처리하므로 여기 오는 건 구매확정/기간/중복 같은 사유다. */}
        {createReview.isError && (
          <Alert variant="error" title="리뷰를 등록하지 못했어요">
            {reviewErrorMessage(createReview.error)}
          </Alert>
        )}

        {/* 적립 안내 */}
        <Alert variant="info" title={`포토 리뷰 적립금 ${REVIEW_REWARD.toLocaleString('ko-KR')}원`}>
          사진과 함께 리뷰를 남기면 영업일 1일 내 적립금을 드려요.
        </Alert>
      </div>
    </MobileScreen>
  )
}

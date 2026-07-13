import { Image as ImageIcon } from 'lucide-react'
import type { Review } from '@aechak/domain'
import { RatingInput } from '@aechak/design-system/web'

// 내가 쓴 리뷰 카드 — 상품 리뷰 목록(b4-st-3)·내 리뷰 완료 탭(b4-st-6) 공용.
// 같은 목록에 섞이는 타인 리뷰(DS ReviewCard)와 카드 리듬을 맞추려고 세로 순서를 DS ReviewCard와
// 동일하게 둔다: 별점/날짜(상단) → 작성자(내 닉네임) → 본문 → 사진. 수정/삭제 액션은 그 자리를
// 깨지 않게 작성자 행 우측 끝에 붙인다(다른 구매자 리뷰엔 없음).
// DS ReviewCard는 자체 카드 chrome(테두리·배경)을 그려 "카드 안의 카드"가 되므로, 여기선
// 소비 레벨에서 단일 카드로 본문을 직접 배치한다(DS ReviewCard 미수정 — 공용 컴포넌트 보존).
// 사진 확대는 상위가 소유한 라이트박스로 위임한다.
export function MyReviewCard({
  review,
  nickname,
  productName,
  thumbnailUrl,
  onEdit,
  onDelete,
  onImageOpen,
}: {
  review: Review
  nickname: string
  /** 내 리뷰 완료 탭에서만 상품 컨텍스트(썸네일/상품명)를 함께 보여준다. */
  productName?: string
  thumbnailUrl?: string
  onEdit: () => void
  onDelete: () => void
  onImageOpen: (src: string) => void
}) {
  const images = review.images

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-raised p-4">
      {/* 상품 컨텍스트(내 리뷰 완료 탭) */}
      {productName && (
        <div className="flex items-center gap-2.5 border-b border-border-subtle pb-3">
          <div className="size-10 flex-none overflow-hidden rounded-image bg-surface-sunken">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-icon-muted">
                <ImageIcon className="size-5" />
              </div>
            )}
          </div>
          <p className="line-clamp-1 min-w-0 flex-1 text-body-sm font-medium text-text-primary">
            {productName}
          </p>
        </div>
      )}

      {/* 별점 + 작성일 — DS ReviewCard와 동일한 상단 순서 */}
      <div className="flex items-center justify-between gap-2">
        <RatingInput value={review.rating} readonly size={14} />
        <span className="text-caption text-text-tertiary">{review.createdAt.slice(5)}</span>
      </div>

      {/* 작성자(내 닉네임) + 수정/삭제 액션 — 타인 리뷰의 작성자 행 자리에 맞추고, 우측에 액션 노출 */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-label font-semibold text-text-secondary">
          {nickname}
        </span>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2 py-1 text-caption font-medium text-text-secondary"
          >
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-2 py-1 text-caption font-medium text-error-fg"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 본문 */}
      <p className="text-body-sm leading-relaxed text-text-primary">{review.content}</p>

      {/* 사진(가로 스크롤 썸네일, 탭 시 확대) */}
      {images.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onImageOpen(src)}
              aria-label={`리뷰 사진 ${i + 1} 확대 보기`}
              className="flex-none cursor-pointer rounded-sm"
            >
              <img
                src={src}
                alt={`리뷰 사진 ${i + 1}`}
                className="size-[72px] rounded-sm bg-surface-sunken object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

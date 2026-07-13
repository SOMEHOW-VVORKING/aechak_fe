import { RatingInput } from './RatingInput'
import { StatusPill } from './StatusPill'

export interface ReviewCardProps {
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  date: string
  content: string
  images?: string[]
  /** 구매 인증 pill(목업 b4-st-3의 "구매" 뱃지) 표시 여부. */
  verifiedPurchase?: boolean
  /**
   * 사진 썸네일을 탭 가능하게 만들고 클릭한 이미지 index를 통지한다(라이트박스 확대용).
   * 주면 각 썸네일이 버튼으로 감싸지고, 안 주면 지금과 100% 동일하게 정적 이미지로 렌더된다.
   * DS는 뷰어/아이콘 라이브러리를 내장하지 않으므로 확대 뷰어는 소비 측이 담당한다.
   */
  onImageClick?: (index: number) => void
  className?: string
}

export function ReviewCard({
  author,
  rating,
  date,
  content,
  images,
  verifiedPurchase,
  onImageClick,
  className = '',
}: ReviewCardProps) {
  return (
    <div
      className={[
        'rounded-card border border-border-subtle bg-surface-raised p-3.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between">
        <RatingInput value={rating} readonly size={14} />
        <span className="text-caption text-text-tertiary">{date}</span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-label font-semibold text-text-secondary">{author}</span>
        {verifiedPurchase && (
          <StatusPill variant="brand" size="sm">
            <svg
              className="size-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15.5l.9-2.9-.9-2.9 2.4-1.8 1-2.8 3-.1L12 2z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            구매
          </StatusPill>
        )}
      </div>

      <p className="mt-2 text-body-sm leading-relaxed text-text-primary">{content}</p>

      {images && images.length > 0 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {images.map((src, i) =>
            onImageClick ? (
              <button
                key={i}
                type="button"
                onClick={() => onImageClick(i)}
                aria-label={`리뷰 사진 ${i + 1} 확대 보기`}
                className="flex-none cursor-pointer rounded-sm"
              >
                <img
                  src={src}
                  alt={`리뷰 사진 ${i + 1}`}
                  className="size-[72px] rounded-sm bg-surface-sunken object-cover"
                />
              </button>
            ) : (
              <img
                key={i}
                src={src}
                alt={`리뷰 사진 ${i + 1}`}
                className="size-[72px] flex-none rounded-sm bg-surface-sunken object-cover"
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

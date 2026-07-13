export interface RatingInputProps {
  value: number
  onChange?: (value: number) => void
  max?: number
  /** 별 한 개의 픽셀 크기(가로·세로 동일). 기본 28. */
  size?: number
  readonly?: boolean
  className?: string
}

// 별 사이 간격(px). Tailwind `gap-0.5`(=2px)와 동일 값 — readonly 부분 채움 clip이 이 값에
// 픽셀 단위로 의존하므로 상수로 두고 별 행에는 className이 아니라 inline style로 적용한다.
const STAR_GAP = 2

function Star({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z" />
    </svg>
  )
}

export function RatingInput({
  value,
  onChange,
  max = 5,
  size = 28,
  readonly,
  className = '',
}: RatingInputProps) {
  const interactive = !readonly && !!onChange
  const stars = Array.from({ length: max })

  if (interactive) {
    return (
      <div
        className={['inline-flex', className].filter(Boolean).join(' ')}
        style={{ gap: STAR_GAP }}
        role="radiogroup"
        aria-label="별점 선택"
      >
        {stars.map((_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            aria-label={`${i + 1}점`}
            onClick={() => onChange(i + 1)}
            className="rounded-xs leading-none focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <Star size={size} className={i < value ? 'text-warning' : 'text-border'} />
          </button>
        ))}
      </div>
    )
  }

  // 표시 전용: 소수 평점은 마지막 별을 소수부만큼만 채운다(정수 반올림 금지).
  // 채워진 폭(px) = 앞의 full개 별 + 그 앞의 gap들 + 마지막 별의 소수부 폭.
  // value/max 비율로 "전체 폭"을 자르던 이전 방식은 별 사이 gap 때문에 경계가 어긋나
  // 작은 소수부(예: 4.1)가 gap 구간에 묻혀 사라지는 버그가 있었다 — 픽셀 지오메트리로 계산한다.
  const clamped = Math.max(0, Math.min(value, max))
  const fullStars = Math.floor(clamped)
  const frac = clamped - fullStars
  const filledWidth = fullStars * (size + STAR_GAP) + frac * size

  return (
    <div
      className={['relative inline-flex', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${max}점 만점에 ${value}점`}
    >
      <div className="flex" style={{ gap: STAR_GAP }}>
        {stars.map((_, i) => (
          <Star key={i} size={size} className="text-border" />
        ))}
      </div>
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: filledWidth }}
        aria-hidden="true"
      >
        <div className="flex w-max" style={{ gap: STAR_GAP }}>
          {stars.map((_, i) => (
            <Star key={i} size={size} className="text-warning" />
          ))}
        </div>
      </div>
    </div>
  )
}

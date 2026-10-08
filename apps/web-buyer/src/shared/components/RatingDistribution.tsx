import { RatingInput } from '@aechak/design-system/web'

// 평균 별점 + 별 + 건수 + 5단계 분포 막대(상품 상세 리뷰 요약, 상품 리뷰 목록 상단 공용).
// 바깥 chrome(카드/구분선)과 블록 간격은 호출부가 className으로 준다.
export function RatingDistribution({
  average,
  total,
  distribution,
  starSuffix = false,
  className = '',
}: {
  average: number
  total: number
  /** 5점부터 1점까지의 비율(%) 5개. */
  distribution: readonly number[]
  /** 막대 라벨을 `5★`처럼 별 기호와 함께 그린다(기본은 숫자만). */
  starSuffix?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex flex-none flex-col items-center gap-1">
        <span className="text-display font-bold leading-none text-text-primary">{average.toFixed(1)}</span>
        <RatingInput value={average} readonly size={14} />
        <span className="text-caption text-text-tertiary">{total.toLocaleString('ko-KR')}개</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {distribution.map((pct, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`${starSuffix ? 'w-5' : 'w-4'} flex-none text-caption text-text-tertiary`}>
              {5 - i}
              {starSuffix ? '★' : ''}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

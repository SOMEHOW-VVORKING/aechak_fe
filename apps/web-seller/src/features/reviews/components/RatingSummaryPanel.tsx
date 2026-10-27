import { BarChart, Card, RatingInput } from '@aechak/design-system/web'
import { formatAverageRating, ratingBars, type SellerReviewSummary } from '../reviews.contract'

// 평균 별점 + 별점 분포. 분포는 DS BarChart를 그대로 쓴다(새 차트를 만들지 않는다).
export function RatingSummaryPanel({ summary }: { summary: SellerReviewSummary }) {
  const average = formatAverageRating(summary.averageRating)
  const bars = ratingBars(summary.ratingDistribution)

  return (
    <Card padding="md">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex-none text-center sm:w-40">
          {/* 리뷰가 없으면 서버가 평균을 null로 준다 — 0.0으로 꾸미지 않는다 */}
          <p className="text-display font-semibold tabular-nums text-text-primary">
            {average ?? '—'}
          </p>
          <div className="mt-1 flex justify-center">
            <RatingInput value={summary.averageRating ?? 0} readonly size={18} />
          </div>
          <p className="mt-1.5 text-caption text-text-tertiary">
            리뷰 {summary.reviewCount.toLocaleString()}건
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-2 text-label font-medium text-text-secondary">별점 분포</p>
          <BarChart
            data={bars.map(({ rating, count }) => ({ label: `${rating}점`, value: count }))}
            height={96}
            formatValue={value => `${value.toLocaleString()}건`}
            // 막대가 카드 폭 전체로 늘어나면 분포가 아니라 장식처럼 보인다 — 폭을 묶는다.
            className="max-w-xl"
          />
        </div>
      </div>
    </Card>
  )
}

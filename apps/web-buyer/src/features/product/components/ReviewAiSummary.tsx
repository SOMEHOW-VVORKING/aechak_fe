import { Card } from '@aechak/design-system/web'
import type {
  PetWeightBand,
  ProductReviewSummaryResponse,
  AiReviewSummaryPointResponse,
  AiReviewSummaryResponse,
} from '@aechak/api'

// 시안 없이 잡은 초안 문구라 한곳에 모아 둔다.
const COPY = {
  title: 'AI 리뷰 요약',
  similarPetTitle: (band: string) => `우리 아이와 비슷한 ${band} 보호자 리뷰`,
  analyzed: (count: number) => `리뷰 ${count.toLocaleString('ko-KR')}건을 분석했어요`,
  pros: '좋은 점',
  cons: '아쉬운 점',
  // mentionCount는 사람 수가 아니라 그 장단점을 말한 리뷰 수다. 한 사람이 리뷰를 여러 건 쓸 수 있다.
  mentions: (count: number) => `리뷰 ${count.toLocaleString('ko-KR')}건`,
  disclaimer: '구매자 리뷰를 AI가 요약한 내용이라 실제 리뷰와 다를 수 있어요.',
  loadFailed: 'AI 리뷰 요약을 불러오지 못했어요.',
}

// 아쉬운 점이 비어도 칸을 숨기지 않는다. 숨기면 반복된 단점이 있는 상품도 단점이 없는 것처럼 보인다.
const CONS_ABSENCE_NOTE: Record<string, string> = {
  NO_NEGATIVE_MENTIONS_FOUND: '분석한 리뷰에서 아쉬운 점 언급은 없었어요.',
  BELOW_MENTION_THRESHOLD: '여러 명이 공통으로 말한 아쉬운 점은 아직 없어요.',
  PARTIALLY_UNEXTRACTED: '일부 리뷰를 아직 분석하지 못해 아쉬운 점은 정리하지 않았어요.',
  NARRATION_MISSING: '여러 리뷰에서 나온 아쉬운 점이 있지만 아직 정리하지 못했어요.',
}
const CONS_ABSENCE_FALLBACK = '아쉬운 점은 아직 정리하지 못했어요.'

const WEIGHT_BAND_LABEL: Record<PetWeightBand, string> = {
  DOG_UNDER_5: '5kg 미만 강아지',
  DOG_5_10: '5~10kg 강아지',
  DOG_10_25: '10~25kg 강아지',
  DOG_25_PLUS: '25kg 이상 강아지',
  CAT_UNDER_4: '4kg 미만 고양이',
  CAT_4_6: '4~6kg 고양이',
  CAT_6_PLUS: '6kg 이상 고양이',
}

// 로딩 중에는 그리지 않는다. 실패는 요약이 없는 것과 구분되게 한 줄로 알린다.
export function ReviewAiSummary({
  data,
  isError,
}: {
  data: ProductReviewSummaryResponse | undefined
  isError: boolean
}) {
  if (isError) {
    return <p className="break-keep text-caption text-text-tertiary">{COPY.loadFailed}</p>
  }
  if (!data) return null
  const { productSummary, similarPetSummary } = data
  if (!productSummary && !similarPetSummary) return null
  return (
    <section className="flex flex-col gap-1.5" aria-label={COPY.title}>
      <div className="flex flex-col gap-3">
        {productSummary && <SummaryCard title={COPY.title} summary={productSummary} />}
        {similarPetSummary && (
          <SummaryCard
            title={COPY.similarPetTitle(WEIGHT_BAND_LABEL[similarPetSummary.weightBand])}
            summary={similarPetSummary.summary}
          />
        )}
      </div>
      <p className="break-keep text-caption text-text-tertiary">{COPY.disclaimer}</p>
    </section>
  )
}

function SummaryCard({ title, summary }: { title: string; summary: AiReviewSummaryResponse }) {
  const consNote = CONS_ABSENCE_NOTE[summary.consAbsenceReason ?? ''] ?? CONS_ABSENCE_FALLBACK
  return (
    <Card className="flex flex-col gap-4 break-keep p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-label font-semibold text-text-primary">{title}</h2>
        <p className="text-caption text-text-tertiary">
          {COPY.analyzed(summary.analyzedReviewCount)}
        </p>
      </div>
      {summary.pros.length > 0 && <PointGroup label={COPY.pros} points={summary.pros} />}
      {summary.cons.length > 0 ? (
        <PointGroup label={COPY.cons} points={summary.cons} />
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm font-semibold text-text-secondary">{COPY.cons}</h3>
          <p className="text-body-sm text-text-tertiary">{consNote}</p>
        </div>
      )}
    </Card>
  )
}

function PointGroup({ label, points }: { label: string; points: AiReviewSummaryPointResponse[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body-sm font-semibold text-text-secondary">{label}</h3>
      <ul className="flex flex-col gap-3">
        {points.map(point => (
          <li key={point.aspectCode} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-body-sm text-text-primary">{point.headline}</span>
              <span className="flex-none text-caption text-text-tertiary">
                {COPY.mentions(point.mentionCount)}
              </span>
            </div>
            {point.quotes[0] && (
              <blockquote className="break-words text-caption text-text-tertiary">{point.quotes[0]}</blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

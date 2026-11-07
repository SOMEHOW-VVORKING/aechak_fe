import { StatusPill } from '@aechak/design-system/web'
import {
  UNMEASURED,
  formatCount,
  formatMs,
  formatRate,
  formatUsd,
  type CostStageRow,
  type LatencyRow,
} from '../ai-review-metrics.map'

/**
 * 단계별 지출 — 어느 단계가 돈을 쓰는지가 "비평을 끌지 말지"의 유일한 근거다.
 *
 * 막대는 총액 대비 비율 한 축만 쓴다(한 색조). 단계마다 단가가 달라 호출 수와 금액을 한
 * 그림에 겹치면 눈금이 둘인 차트가 되고, 그러면 없는 상관관계가 보인다 — 호출 수는 글자로만 적는다.
 */
export function CostByStageRows({
  rows,
  totalCostMicroUsd,
}: {
  rows: CostStageRow[]
  totalCostMicroUsd: number
}) {
  if (rows.length === 0) {
    return (
      <p className="break-keep text-caption text-text-tertiary">
        서버가 단계별 지출을 아직 주지 않아요. 비평 / 수정 문구가 원장에 같은 관점으로 적혀 단계를
        가를 수 없는 상태라, 지금은 총액만 믿을 수 있어요.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {rows.map(row => {
        const share = totalCostMicroUsd > 0 ? row.costMicroUsd / totalCostMicroUsd : null
        return (
          <li key={row.stage} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="flex items-center gap-1.5 text-body-sm text-text-primary">
                {row.stageLabel}
                {/* 비평과 수정 문구가 한 덩어리로 적힌 행이다 — 비평 단가로 읽으면 안 된다. */}
                {row.unattributed && (
                  <StatusPill size="sm" variant="warning">
                    단계를 가를 수 없어요
                  </StatusPill>
                )}
              </span>
              <span className="text-caption tabular-nums text-text-secondary">
                {formatUsd(row.costMicroUsd)} / {formatCount(row.callCount)}회{' '}
                {share == null ? '' : `/ ${formatRate(share)}`}
              </span>
            </div>
            <span
              className="block h-2 w-full overflow-hidden rounded-sm bg-surface-sunken"
              aria-hidden="true"
            >
              {share != null && (
                <span
                  className="block h-full rounded-r-[4px] bg-brand"
                  style={{ width: `${Math.max(0, Math.min(100, share * 100))}%` }}
                />
              )}
            </span>
            {row.cacheMissCallCount != null && (
              <p className="text-caption text-text-tertiary">
                캐시 미적중 {formatCount(row.cacheMissCallCount)}회
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 단계별 지연 — 꼬리 지연(p95)을 만드는 단계가 미판정 기한을 정하는 근거다.
 *
 * 막대를 그리지 않는 이유: 한 행에 p50·p95 두 값이 있고 단계마다 표본 수가 달라, 막대로
 * 그리면 둘 중 어느 값을 그린 것인지 읽는 쪽이 알 수 없다. 숫자 둘을 그대로 적는 쪽이 정확하다.
 */
export function LatencyRows({ rows }: { rows: LatencyRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="break-keep text-caption text-text-tertiary">
        서버가 단계별 지연을 아직 주지 않아요.
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {rows.map(row => (
        <li key={row.stage} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-body-sm text-text-primary">{row.stageLabel}</span>
          <span className="text-caption tabular-nums text-text-secondary">
            p50 {formatMs(row.p50Ms)} / p95 {formatMs(row.p95Ms)} / 표본{' '}
            {formatCount(row.sampleCount)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** 비율 하나와 그 분모를 함께 적는 작은 칸. 분모를 빼면 비율끼리 비교해도 되는 값으로 읽힌다. */
export function RateFigure({
  label,
  rate,
  basis,
}: {
  label: string
  rate: number | null
  basis: string
}) {
  return (
    <div>
      <dt className="text-caption text-text-tertiary">{label}</dt>
      <dd className="text-body-sm font-medium tabular-nums text-text-primary">
        {formatRate(rate)}
      </dd>
      <dd className="break-keep text-caption text-text-tertiary">{basis}</dd>
    </div>
  )
}

/** 건수 한 칸. 값이 없으면 0이 아니라 미측정으로 적는다. */
export function CountFigure({ label, count }: { label: string; count: number | null }) {
  return (
    <div>
      <dt className="text-caption text-text-tertiary">{label}</dt>
      <dd className="text-body-sm font-medium tabular-nums text-text-primary">
        {count == null ? UNMEASURED : `${formatCount(count)}건`}
      </dd>
    </div>
  )
}

import { Alert, StatusPill } from '@aechak/design-system/web'
import type { StatusPillVariant } from '@aechak/design-system/web'
import {
  UNMEASURED,
  formatCount,
  formatRate,
  type FunnelExitView,
  type FunnelStageView,
  type FunnelView,
} from '../ai-review-metrics.map'

interface StageFunnelProps {
  funnel: FunnelView
}

/**
 * 단계별 퍼널 — 막대 폭이 단계를 거치며 줄어드는 모양으로 "어디서 얼마나 걸러지는가"를 보여 준다.
 *
 * 세로로 쌓는 이유: 단계마다 비율의 **분모가 다르고**(1단은 미판정을 뺀 전수, 2단은 선별
 * 호출이 나간 검수, 3단은 응답이 온 검수) 그 분모를 숫자 옆에 적어야 읽을 수 있다. 가로로
 * 늘어놓으면 그 설명이 들어갈 자리가 없어 비율만 남고, 분모가 다른 네 비율을 나란히 두면
 * 운영자가 서로 비교해도 되는 값으로 읽는다.
 *
 * 색은 한 색조(브랜드 그린)의 네 단계다 — 단계는 **순서가 뜻을 가지는** 범주라 순서가 색에도
 * 보여야 하고, 범주형 여러 색조를 쓰면 네 단계가 서로 다른 것들로 읽힌다. 단계 수가 늘면
 * 색조를 더 만들지 말고 명도 단계를 다시 나눠야 한다.
 *
 * 모든 값은 글자로도 적는다 — 막대 길이나 색만으로 읽어야 하는 수치를 두지 않는다.
 */
export function StageFunnel({ funnel }: StageFunnelProps) {
  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        {funnel.stages.map(stage => (
          <li key={stage.key}>
            <FunnelRow stage={stage} />
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <p className="text-label font-semibold text-text-secondary">어디서 끝났는가</p>
        <ExitRows rows={funnel.exits} />
        {funnel.terminals.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {/* 실패 터미널은 퍼널 밖이다 — 같은 목록에 섞으면 단계를 거쳐 끝난 것으로 읽힌다. */}
            <p className="text-caption text-text-tertiary">
              퍼널 밖에서 끝난 것 — 단계를 끝까지 거치지 못했어요.
            </p>
            <ExitRows rows={funnel.terminals} terminal />
          </div>
        )}
      </div>

      {funnel.unclassifiedCount > 0 && (
        // 분류 규칙이 모르는 끝맺음이 생겼다는 뜻이다. 조용히 두면 탈출 비율의 합이 100%가
        // 아닌 채로 읽히고, 그 차이가 어디서 왔는지 알 길이 없다.
        <Alert variant="warning" title="분류되지 않은 검수가 있어요">
          {formatCount(funnel.unclassifiedCount)}건이 어느 탈출로도 분류되지 않았어요. 파이프라인에
          새로운 끝맺음이 생겼을 수 있어 아래 비율의 합이 100%가 되지 않아요.
        </Alert>
      )}
    </div>
  )
}

/** 막대 색 — 브랜드 그린 한 색조의 네 단계(밝음 → 어두움). 디자인시스템이 내보내는 램프 변수다. */
const STAGE_FILL = [
  'var(--green-300)',
  'var(--green-400)',
  'var(--green-500)',
  'var(--green-600)',
]

function FunnelRow({ stage }: { stage: FunnelStageView }) {
  const share = stage.share
  const widthPercent = share == null ? 0 : Math.max(0, Math.min(100, share * 100))
  const fill = STAGE_FILL[stage.order - 1] ?? STAGE_FILL[0]

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-body-sm font-medium text-text-primary">
          {stage.order}단 {stage.label}
        </p>
        <p className="text-caption text-text-tertiary">
          진입{' '}
          <span className="font-semibold tabular-nums text-text-secondary">
            {formatCount(stage.enteredCount)}
          </span>
          건 {share == null ? '' : `/ 전체의 ${formatRate(share)}`}
        </p>
      </div>

      {/* 막대 두께는 24px이고 끝만 둥글다 — 왼쪽은 기준선이라 각지게 둔다. */}
      <div
        className="h-6 w-full overflow-hidden rounded-sm border border-border-subtle bg-surface-sunken"
        title={`${stage.order}단 ${stage.label} 진입 ${formatCount(stage.enteredCount)}건 / ${stage.exitLabel} ${formatCount(stage.exitedCount)}건`}
      >
        {share != null && (
          <div className="h-full rounded-r-[4px]" style={{ width: `${widthPercent}%`, background: fill }} />
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-caption text-text-secondary">
          {stage.rateLabel}{' '}
          <span className="font-semibold tabular-nums text-text-primary">
            {formatRate(stage.rate)}
          </span>
          {stage.exitedCount != null && (
            <span className="text-text-tertiary">
              {' '}
              — {stage.exitLabel} {formatCount(stage.exitedCount)}건
            </span>
          )}
        </p>
        <p className="break-keep text-caption text-text-tertiary">{stage.rateBasis}</p>
      </div>

      <p className="break-keep text-caption text-text-tertiary">{stage.caption}</p>

      {stage.caveat && (
        // 분모가 조건부로 틀리는 자리를 적어 둔다 — 비율을 그대로 믿으면 반대 결론이 나온다.
        <p className="break-keep text-caption text-warning-fg">{stage.caveat}</p>
      )}

      {share == null && (
        <p className="break-keep text-caption text-text-tertiary">
          이 단계는 서버가 아직 숫자를 주지 않아 {UNMEASURED}이에요.
        </p>
      )}
    </div>
  )
}

/** 실패 터미널의 pill — 색만으로 뜻을 전하지 않도록 라벨 글자를 늘 함께 둔다. */
const TERMINAL_VARIANT: Record<string, StatusPillVariant> = {
  VERDICT_FAILED: 'error',
  UNJUDGED: 'error',
  UNCLASSIFIED: 'warning',
}

function ExitRows({ rows, terminal = false }: { rows: FunnelExitView[]; terminal?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-caption text-text-tertiary">서버가 탈출 분포를 주지 않았어요.</p>
  }
  return (
    <ul className="space-y-1.5">
      {rows.map(row => (
        <li key={row.exit} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-28 flex-none">
            {terminal ? (
              <StatusPill size="sm" variant={TERMINAL_VARIANT[row.exit] ?? 'warning'}>
                {row.label}
              </StatusPill>
            ) : (
              <span className="text-caption text-text-secondary">{row.label}</span>
            )}
          </span>
          <span
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-surface-sunken"
            aria-hidden="true"
          >
            {row.share != null && (
              <span
                className="block h-full rounded-r-[4px] bg-brand"
                style={{ width: `${Math.max(0, Math.min(100, row.share * 100))}%` }}
              />
            )}
          </span>
          <span className="flex-none text-caption tabular-nums text-text-primary">
            {formatCount(row.count)}건 / {formatRate(row.share)}
          </span>
        </li>
      ))}
    </ul>
  )
}

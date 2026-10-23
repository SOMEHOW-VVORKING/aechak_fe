import { ChevronDown } from 'lucide-react'
import { StatusPill } from '@aechak/design-system/web'
import { formatCostMicroUsd, type PipelineStageView } from '../ai-review-queue.map'

interface PipelineFlowProps {
  stages: PipelineStageView[]
}

/**
 * 파이프라인 흐름 — 어느 단계가 돌았고 어디서 걸렸는지 한눈에 보이게 세로로 쌓는다.
 *
 * 세로인 이유: 단계마다 관점 줄과 미검사 사유가 붙어 높이가 들쭉날쭉하고, 드로어가 480px이라
 * 가로로 늘어놓으면 라벨이 글자 단위로 쪼개진다.
 *
 * `inferred`인 단계는 그렇다고 적는다. 비평·수정문구는 원장이 둘 다 `ALL` 관점으로 적어
 * 단계를 구분해 주지 않아서 순서로 가른 추정이고, 추정을 확증처럼 보여 주면 운영자가
 * "비평이 봤으니 괜찮다"고 잘못 읽는다.
 */
export function PipelineFlow({ stages }: PipelineFlowProps) {
  return (
    <ol className="space-y-1">
      {stages.map((stage, index) => (
        <li key={stage.key}>
          {index > 0 && (
            <ChevronDown className="mx-auto my-0.5 size-3.5 text-icon-muted" aria-hidden="true" />
          )}
          <div className="space-y-2 rounded-md border border-border-subtle bg-surface-sunken p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-text-primary">
                  {index + 1}. {stage.label}
                </p>
                <p className="break-keep text-caption text-text-tertiary">{stage.caption}</p>
              </div>
              <span className="flex-none">
                <StatusPill variant={stage.statusMeta.variant}>{stage.statusMeta.label}</StatusPill>
              </span>
            </div>

            {stage.reason && (
              <p className="break-keep text-caption text-text-secondary">사유 — {stage.reason}</p>
            )}

            {stage.rows.length > 0 && (
              <ul className="space-y-1">
                {stage.rows.map(row => (
                  <li
                    key={row.perspective}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption"
                  >
                    <span className="text-text-secondary">{row.perspectiveLabel}</span>
                    <StatusPill
                      size="sm"
                      variant={
                        row.status === 'violation'
                          ? 'error'
                          : row.status === 'clear'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {row.status === 'violation'
                        ? '위반'
                        : row.status === 'clear'
                          ? '통과'
                          : '미검사'}
                    </StatusPill>
                    {row.skipReason && (
                      <span
                        className={
                          row.triageSkipped ? 'text-text-tertiary' : 'text-error-fg'
                        }
                      >
                        {row.skipReason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {stage.calls.length > 0 && (
              <ul className="space-y-0.5 border-t border-border-subtle pt-2">
                {stage.calls.map((call, callIndex) => (
                  <li
                    // 같은 모델·결과·지연의 호출이 한 단계에 둘 올 수 있어 인덱스를 섞는다.
                    key={`${callIndex}-${call.modelId}-${call.outcome}`}
                    className="flex flex-wrap items-center gap-x-2 text-caption text-text-tertiary"
                  >
                    <span className="font-mono">{call.modelId}</span>
                    <span className={call.failed ? 'text-error-fg' : undefined}>
                      {call.outcome}
                    </span>
                    <span className="tabular-nums">{call.latencyMs}ms</span>
                    <span className="tabular-nums">{formatCostMicroUsd(call.costMicroUsd)}</span>
                  </li>
                ))}
              </ul>
            )}

            {stage.inferred && (
              <p className="break-keep text-caption text-text-tertiary">
                호출 원장에 단계 이름이 없어 호출 순서로 가른 추정이에요.
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

import { Alert, StatusPill } from '@aechak/design-system/web'
import type { PipelinePerspectiveRow } from '../ai-review-queue.map'

interface ViolationListProps {
  rows: PipelinePerspectiveRow[]
}

/**
 * 위반 목록 — 이 화면의 핵심이다. 분류 / 원문 인용 / 수정 제안을 한 덩어리로 묶어 보여 준다.
 *
 * 인용구는 셀러가 직접 쓴 문장이고 연락처 원문이 들어 있을 수 있어 **가공하지 않고** 그대로
 * 보여 준다(운영자가 판단해야 하는 값이다). 줄바꿈과 긴 공백도 원문 그대로 보이게 `pre-wrap`을
 * 쓴다 — 공백으로 금칙어를 쪼갠 우회 표기가 화면에서 접히면 운영자가 그걸 못 본다.
 *
 * 파싱하지 못한 행은 "위반 없음"으로 접지 않고 원문을 드러낸다. 접으면 위반이 있는 건이
 * 화면에서 깨끗해 보이고, 그 상태로 허용을 누르면 위반 문구가 그대로 노출된다.
 */
export function ViolationList({ rows }: ViolationListProps) {
  if (rows.length === 0) {
    return <p className="text-body-sm text-text-tertiary">기록된 위반이 없어요.</p>
  }

  return (
    <div className="space-y-3">
      {rows.map(row => (
        <div key={row.perspective} className="space-y-2">
          <p className="text-caption text-text-tertiary">{row.perspectiveLabel} 관점</p>

          {row.rawOnParseFailure != null && (
            <Alert variant="error">
              위반 상세를 읽지 못했어요. 서버가 보낸 원문을 그대로 보여 줄게요 — 허용을 누르기
              전에 꼭 확인해 주세요.
              <span className="mt-1.5 block whitespace-pre-wrap break-all font-mono text-caption">
                {row.rawOnParseFailure}
              </span>
            </Alert>
          )}

          {row.violations.map((violation, index) => (
            <div
              key={`${violation.category}-${index}`}
              className="space-y-2 rounded-md border border-error-border bg-error-surface p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill variant="error">{violation.categoryLabel}</StatusPill>
                {violation.confidence != null && (
                  <span className="text-caption text-text-tertiary tabular-nums">
                    확신도 {violation.confidence.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="space-y-0.5">
                <p className="text-caption text-text-tertiary">걸린 원문</p>
                {violation.quote ? (
                  <p className="whitespace-pre-wrap break-all border-l-2 border-error-border pl-2 text-body-sm text-text-primary">
                    {violation.quote}
                  </p>
                ) : (
                  <p className="text-body-sm text-text-tertiary">
                    모델이 인용구를 대지 못했어요. 본문에서 직접 확인해 주세요.
                  </p>
                )}
              </div>

              <div className="space-y-0.5">
                <p className="text-caption text-text-tertiary">수정 제안</p>
                {violation.suggestion ? (
                  <p className="whitespace-pre-wrap break-keep text-body-sm text-text-secondary">
                    {violation.suggestion}
                  </p>
                ) : (
                  <p className="text-body-sm text-text-tertiary">
                    제안이 없어요. 규칙 단계가 잡은 위반은 제안을 만들지 않아요.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

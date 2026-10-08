import type { ReactNode } from 'react'
import { StatusPill, type StatusPillVariant } from '@aechak/design-system/web'

/** 식별자(굵게 + tabular) 위, 보조 텍스트 아래 — 주문/클레임 표의 첫 컬럼. */
export function TwoLineCell({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <div>
      <p className="font-semibold tabular-nums text-text-primary">{primary}</p>
      <p className="text-caption text-text-tertiary">{secondary}</p>
    </div>
  )
}

/** StatusPill 아래 보조 텍스트. `pl-2.5` + `mt-1.5`가 pill 안 글자와 왼쪽을 맞추는 값(AGENTS.md 확인 Modal 패턴). */
export function PillWithNote({
  variant,
  label,
  note,
}: {
  variant: StatusPillVariant
  label: ReactNode
  note?: ReactNode
}) {
  return (
    <div>
      <StatusPill variant={variant}>{label}</StatusPill>
      {note != null && <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">{note}</p>}
    </div>
  )
}

/** 더 할 처리가 없는 행의 액션 셀 표시. */
export function DoneLabel() {
  return <span className="text-caption text-text-tertiary">처리 완료</span>
}

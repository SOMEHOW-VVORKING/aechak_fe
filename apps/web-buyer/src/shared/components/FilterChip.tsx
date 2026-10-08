import type { ReactNode } from 'react'

// 토글형 필터/정렬 칩(FAQ 카테고리, 리뷰 정렬·포토, 검색 결과 퀵필터·필터 시트 공용).
// DS FilterChipGroup과 모양이 달라(h-8/9, text-body-sm, 선택 시 brand-subtle) 앱 로컬로 둔다.
export function FilterChip({
  selected,
  onClick,
  children,
  size = 'md',
  expanded,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  size?: 'sm' | 'md'
  /** 시트를 여는 칩이면 열림 상태를 준다 — 토글 칩은 aria-pressed만, 시트 칩은 haspopup/expanded까지. */
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded}
      className={[
        'inline-flex flex-none items-center rounded-chip border text-body-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
        size === 'sm' ? 'h-8 px-3' : 'h-9 gap-1 px-3.5',
        selected
          ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
          : 'border-border bg-surface-base text-text-secondary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

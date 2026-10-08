import type { ReactNode } from 'react'

const toneClass = {
  info: 'bg-info-surface text-info-fg',
  brand: 'bg-brand-subtle text-brand',
  warning: 'bg-warning-surface text-warning-fg',
}

/**
 * 테두리 없는 둥근 태그(행위자 · 탐지 사유). DS StatusPill은 rounded-xs + border라 모양이 달라
 * 대체할 수 없다. children에 아이콘(size-3)과 텍스트를 StatusPill처럼 나란히 넣는다.
 */
export function Tag({ tone, children }: { tone: keyof typeof toneClass; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  )
}

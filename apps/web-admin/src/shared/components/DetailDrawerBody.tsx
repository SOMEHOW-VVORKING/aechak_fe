import type { ReactNode } from 'react'

interface DetailDrawerBodyProps {
  /** 제목 바로 아래 한 줄 부제(대상 ID · 이름 등). 없으면 children 첫 요소가 머리글을 맡는다. */
  subtitle?: ReactNode
  /** 하단 구분선 아래 액션 버튼들. */
  actions: ReactNode
  children: ReactNode
}

/** 상세 Drawer 본문 뼈대 — 부제 / 필드 / 하단 액션 바를 모든 심사·관리 드로어가 같은 간격으로 그린다. */
export function DetailDrawerBody({ subtitle, actions, children }: DetailDrawerBodyProps) {
  return (
    <div className="space-y-5">
      {subtitle && <p className="-mt-2 text-body-sm text-text-tertiary">{subtitle}</p>}
      {children}
      <div className="flex gap-2 border-t border-border-subtle pt-4">{actions}</div>
    </div>
  )
}

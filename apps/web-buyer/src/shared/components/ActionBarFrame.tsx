import type { ReactNode } from 'react'

// DS BottomFixedAction과 같은 하단 바 chrome(테두리/배경/패딩/safe-area)에 버튼을 직접 넣는 틀.
// BottomFixedAction은 primary(+secondary) 조합만 지원해 danger 단독·secondary 단독 화면이 쓴다.
export function ActionBarFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-sticky flex flex-none flex-col border-t border-border-subtle bg-surface-raised px-4 pt-3"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

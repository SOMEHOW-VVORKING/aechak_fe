import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface BackAppBarProps {
  onBack: () => void
  /** 가운데/우측에 놓을 타이틀 텍스트. children이 있으면 생략 가능. */
  title?: ReactNode
  /** 뒤로가기 버튼 옆을 채우는 커스텀 콘텐츠(예: 검색 입력). */
  children?: ReactNode
  /** 우측 액션(공유 등). */
  actions?: ReactNode
}

// 뒤로가기 앱바 — 상세/검색/검색결과/찜 등 full-bleed(탭바 없는) 화면 상단.
export function BackAppBar({ onBack, title, children, actions }: BackAppBarProps) {
  return (
    <div className="flex h-14 items-center gap-2 px-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="flex size-10 flex-none items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <ChevronLeft className="size-6" />
      </button>
      {title != null && (
        <span className="text-subheading font-semibold text-text-primary">{title}</span>
      )}
      {children && <div className="min-w-0 flex-1">{children}</div>}
      {actions && <div className="ml-auto flex flex-none items-center gap-1 pr-1">{actions}</div>}
    </div>
  )
}

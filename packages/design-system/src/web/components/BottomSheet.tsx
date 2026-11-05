import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  /** 제목을 그리지 않는 시트(비회원 안내, 더보기 메뉴)의 접근성 이름. title이 있으면 title이 이름이다. */
  ariaLabel?: string
  showGrabber?: boolean
  /** 시트 최대 높이(px). 미지정 시 뷰포트의 90%. */
  maxHeight?: number
  className?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// 하단에서 올라오는 시트. web에는 side `Drawer`만 있어 옵션/필터 시트·비회원 게이트 등에
// 쓸 하단 시트를 새로 추가한 것 — 스크림/ESC/포커스 트랩/스크롤 잠금 패턴은 `Modal`/`Drawer`와 동일.
export function BottomSheet({
  open,
  onClose,
  children,
  title,
  ariaLabel,
  showGrabber = true,
  maxHeight,
  className = '',
}: BottomSheetProps) {
  // Stay mounted during close animation; unmount only after transition ends.
  const [mounted, setMounted] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // 렌더 중에 맞춘다. effect로 맞추면 open이 켜진 첫 커밋에 패널이 없어 포커스 이동과 트랩 effect가 패널을 찾지 못한다.
  if (open && !mounted) setMounted(true)

  // Restore focus on close
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus()
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus trap
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      // 열린 직후 포커스는 패널 자신에 있어 first도 last도 아니다. 그대로 두면 Shift+Tab 한 번에 포커스가 시트 뒤로 넘어간다.
      // 포커스가 패널 밖에 있으면 아무것도 하지 않는다. 위에 겹쳐 뜬 오버레이의 Tab까지 처리하면 그 오버레이의 첫 항목에서 포커스가 움직이지 않는다.
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || active === panel) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!mounted) return null

  const panelStyle: CSSProperties = {
    maxHeight: maxHeight != null ? `${maxHeight}px` : '90vh',
    paddingBottom: 'env(safe-area-inset-bottom)',
  }

  return (
    <div
      className={`fixed inset-0 z-bottomsheet flex items-end justify-center ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      {/* Scrim — fade in/out */}
      <div
        className={`absolute inset-0 bg-scrim transition-opacity duration-moderate ${open ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Sheet — slide up/down */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={panelStyle}
        className={[
          // 프레임 이탈 방지는 소비 앱 레벨에서 처리한다 — web-buyer는 __root의 폰 프레임 div에
          // transform으로 containing block을 만들어 이 fixed 오버레이가 뷰포트가 아니라 프레임
          // 기준으로 배치되게 한다(프레임<560이라 max-w는 실제로 안 걸림). 여기에 프레임 폭을
          // 하드코딩하지 말 것.
          'relative z-10 flex w-full max-w-[560px] flex-col rounded-t-bottomsheet bg-surface-raised shadow-bottomsheet outline-none',
          'transition-transform duration-moderate ease-[cubic-bezier(0.2,0,0,1)]',
          open ? 'translate-y-0' : 'translate-y-full',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onTransitionEnd={() => {
          if (!open) setMounted(false)
        }}
      >
        {showGrabber && (
          <div className="flex flex-none justify-center pt-2 pb-1">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
        )}
        {title && (
          <h2
            id={titleId}
            className="flex-none px-5 pb-2 pt-2 text-subheading font-semibold text-text-primary"
          >
            {title}
          </h2>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  )
}

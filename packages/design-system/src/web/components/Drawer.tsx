import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  width?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const widthClass = {
  sm: 'w-80',
  md: 'w-96',
  lg: 'w-[480px]',
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

export function Drawer({ open, onClose, title, width = 'md', children }: DrawerProps) {
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      // 열린 직후 포커스는 패널 자신에 있어 first도 last도 아니다. 그대로 두면 Shift+Tab 한 번에 포커스가 패널 뒤로 넘어간다.
      // 포커스가 패널 밖에 있으면 아무것도 하지 않는다. 위에 겹쳐 뜬 오버레이의 Tab까지 처리하면 그 오버레이의 첫 항목에서 포커스가 움직이지 않는다.
      if (e.shiftKey) {
        if (active === first || active === panel) { e.preventDefault(); last.focus() }
      } else {
        if (active === last || active === panel) { e.preventDefault(); first.focus() }
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
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-modal ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Scrim — fade in/out */}
      <div
        className={`absolute inset-0 bg-scrim transition-opacity duration-moderate ${open ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel — slide in/out from right */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          'absolute inset-y-0 right-0 flex flex-col bg-surface-raised shadow-modal outline-none',
          'transition-transform duration-moderate ease-[cubic-bezier(0.2,0,0,1)]',
          widthClass[width],
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        onTransitionEnd={() => { if (!open) setMounted(false) }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          {title && (
            <h2 id={titleId} className="text-subheading font-semibold text-text-primary">{title}</h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex items-center justify-center size-8 rounded-md text-icon hover:bg-surface-hover transition-colors"
            aria-label="닫기"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

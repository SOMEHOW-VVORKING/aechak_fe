import { type ReactNode, useEffect, useId, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  children?: ReactNode
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  confirmVariant = 'primary',
  loading = false,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Restore focus to previous element on close
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
      const outside = active === panel || !panel.contains(active)
      if (e.shiftKey) {
        if (active === first || outside) { e.preventDefault(); last.focus() }
      } else {
        if (active === last || outside) { e.preventDefault(); first.focus() }
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

  if (!open) return null

  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-danger text-danger-on hover:bg-danger-strong active:brightness-90'
      : 'bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-pressed'

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-scrim"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-sm rounded-modal bg-surface-raised shadow-modal outline-none animate-modal-in"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-subheading font-semibold text-text-primary break-keep break-words">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-body-sm text-text-secondary break-keep break-words">{description}</p>
          )}
          {children && <div className="mt-4">{children}</div>}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2">
          <button
            type="button"
            className="flex-1 h-10 rounded-button border border-border text-button font-semibold text-text-primary hover:bg-surface-hover active:bg-surface-pressed transition-colors"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              type="button"
              className={[
                'flex-1 h-10 rounded-button text-button font-semibold transition-colors',
                'disabled:bg-surface-disabled disabled:text-text-disabled',
                confirmClass,
              ].join(' ')}
              onClick={onConfirm}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? (
                <span className="inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
              ) : (
                confirmLabel
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

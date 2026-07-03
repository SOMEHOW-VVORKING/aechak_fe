import { type ReactNode, useEffect } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  open: boolean
  onClose: () => void
  variant?: ToastVariant
  message: ReactNode
  duration?: number
}

const variantStyle: Record<ToastVariant, { icon: string; iconPath: string; live: 'polite' | 'assertive'; role: 'status' | 'alert' }> = {
  success: {
    icon: 'text-success-fg',
    iconPath: 'M20 6 9 17l-5-5',
    live: 'polite',
    role: 'status',
  },
  error: {
    icon: 'text-error-fg',
    iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 8v4m0 4h.01',
    live: 'assertive',
    role: 'alert',
  },
  info: {
    icon: 'text-info-fg',
    iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 9v5m0-8h.01',
    live: 'polite',
    role: 'status',
  },
  warning: {
    icon: 'text-warning-fg',
    iconPath: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zm1.71 13.14h.01M12 9v4',
    live: 'assertive',
    role: 'alert',
  },
}

export function Toast({ open, onClose, variant = 'info', message, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [open, onClose, duration])

  if (!open) return null

  const s = variantStyle[variant]

  return (
    <div
      role={s.role}
      aria-live={s.live}
      className={[
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-toast',
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-toast',
        'bg-surface-inverse text-text-inverse',
        'text-body-sm font-medium',
      ].join(' ')}
    >
      <svg
        className={`size-4 flex-none ${s.icon}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={s.iconPath} />
      </svg>
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="flex-none opacity-60 hover:opacity-100 transition-opacity ml-2"
        aria-label="닫기"
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

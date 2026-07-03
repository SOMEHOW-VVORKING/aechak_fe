import type { ReactNode } from 'react'

export type AlertVariant = 'info' | 'warning' | 'error' | 'danger'

interface AlertProps {
  variant?: AlertVariant
  title?: string
  children: ReactNode
  onDismiss?: () => void
  className?: string
}

const variantStyle: Record<AlertVariant, { wrap: string; icon: string; iconPath: string }> = {
  info: {
    wrap: 'bg-info-surface border-info-border text-info-fg',
    icon: 'text-info-fg',
    iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 9v5m0-8h.01',
  },
  warning: {
    wrap: 'bg-warning-surface border-warning-border text-warning-fg',
    icon: 'text-warning-fg',
    iconPath: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zm1.71 13.14h.01M12 9v4',
  },
  error: {
    wrap: 'bg-error-surface border-error-border text-error-fg',
    icon: 'text-error-fg',
    iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 8v4m0 4h.01',
  },
  danger: {
    wrap: 'bg-danger-surface border-danger-border text-danger-fg',
    icon: 'text-danger-fg',
    iconPath: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zm1.71 13.14h.01M12 9v4',
  },
}

export function Alert({ variant = 'info', title, children, onDismiss, className = '' }: AlertProps) {
  const s = variantStyle[variant]

  return (
    <div
      role="alert"
      className={[
        'flex gap-3 rounded-lg border px-4 py-3 text-body-sm',
        s.wrap,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        className={`mt-0.5 size-4 flex-none ${s.icon}`}
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
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-none self-start opacity-60 hover:opacity-100 transition-opacity"
          aria-label="닫기"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

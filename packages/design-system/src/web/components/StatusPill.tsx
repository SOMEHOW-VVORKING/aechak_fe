import type { ReactNode } from 'react'

export type StatusPillVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'danger'
  | 'accent'
  | 'brand'
  | 'neutral'
  | 'muted'

interface StatusPillProps {
  variant?: StatusPillVariant
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}

const variantClass: Record<StatusPillVariant, string> = {
  success: 'bg-success-surface text-success-fg border border-success-border',
  warning: 'bg-warning-surface text-warning-fg border border-warning-border',
  error:   'bg-error-surface text-error-fg border border-error-border',
  info:    'bg-info-surface text-info-fg border border-info-border',
  danger:  'bg-danger-surface text-danger-fg border border-danger-border',
  accent:  'bg-accent-subtle text-accent border border-accent-border',
  brand:   'bg-brand-subtle text-brand border border-brand-border',
  neutral: 'bg-neutral-surface text-neutral-fg border border-neutral-border',
  muted:   'bg-muted-surface text-muted border border-muted-border',
}

const dotClass: Record<StatusPillVariant, string> = {
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  error:   'bg-error-fg',
  info:    'bg-info-fg',
  danger:  'bg-danger-fg',
  accent:  'bg-accent',
  brand:   'bg-brand',
  neutral: 'bg-neutral-fg',
  muted:   'bg-muted',
}

export function StatusPill({
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
  className = '',
}: StatusPillProps) {
  const sizeClass = size === 'sm'
    ? 'h-5 px-2 text-badge gap-1 rounded-xs'
    : 'h-6 px-2.5 text-label gap-1.5 rounded-xs'

  return (
    <span
      className={[
        'inline-flex items-center font-semibold whitespace-nowrap',
        variantClass[variant],
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && <span className={`size-1.5 rounded-full flex-none ${dotClass[variant]}`} />}
      {children}
    </span>
  )
}

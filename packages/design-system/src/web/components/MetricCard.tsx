import { type ReactNode } from 'react'

type MetricVariant = 'default' | 'urgent' | 'quiet'

export interface MetricCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  footer?: ReactNode
  variant?: MetricVariant
  onClick?: () => void
  className?: string
}

const variantClass: Record<MetricVariant, string> = {
  default: 'bg-surface-raised border-border-subtle cursor-pointer hover:bg-surface-hover',
  urgent:  'bg-surface-raised border-warning-border cursor-pointer hover:bg-surface-hover',
  quiet:   'bg-surface-sunken border-border-subtle cursor-default',
}

export function MetricCard({ label, value, icon, footer, variant = 'default', onClick, className = '' }: MetricCardProps) {
  const isClickable = variant !== 'quiet' && !!onClick

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter') onClick?.() } : undefined}
      className={[
        'rounded-card border px-4 py-3.5 flex flex-col gap-1.5 transition-colors',
        variantClass[variant],
        isClickable ? 'focus-visible:outline-none focus-visible:shadow-focus-ring' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
        {icon && <span className="size-3.5 flex-none">{icon}</span>}
        {label}
      </div>
      <div className="text-heading font-semibold text-text-primary tabular-nums tracking-tight">
        {value}
      </div>
      {footer && (
        <div className="mt-auto inline-flex items-center gap-1 text-caption text-text-secondary">
          {footer}
        </div>
      )}
    </div>
  )
}

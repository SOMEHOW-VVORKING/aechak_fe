import type { ReactNode } from 'react'

export interface RadioCardProps {
  selected: boolean
  onSelect: () => void
  title: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
  className?: string
  name?: string
}

export function RadioCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  disabled,
  className = '',
  name,
}: RadioCardProps) {
  return (
    <label
      className={[
        'flex items-start gap-3 rounded-card border p-3.5 transition-colors',
        selected ? 'border-brand-border bg-surface-selected' : 'border-border-subtle bg-surface-raised',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-hover',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span
        className={[
          'relative flex size-[18px] flex-none items-center justify-center rounded-full transition-colors mt-0.5',
          selected ? 'border-[6px] border-brand bg-surface-raised' : 'border-[1.5px] border-border-strong',
        ].join(' ')}
      >
        <input
          type="radio"
          name={name}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="sr-only"
        />
      </span>
      {icon && <span className="flex-none text-icon">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-body font-medium text-text-primary">{title}</span>
        {description && <span className="block text-body-sm text-text-tertiary mt-0.5">{description}</span>}
      </span>
    </label>
  )
}

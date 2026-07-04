import type { ReactNode } from 'react'

export interface SegmentedControlOption {
  value: string
  label: string
  icon?: ReactNode
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SegmentedControl({ options, value, onChange, className = '' }: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      className={['inline-flex gap-1 p-1 rounded-md bg-surface-sunken', className].filter(Boolean).join(' ')}
    >
      {options.map(opt => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={[
              'flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-sm px-3 text-label font-medium transition-colors',
              selected ? 'bg-surface-raised text-text-primary shadow-card' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

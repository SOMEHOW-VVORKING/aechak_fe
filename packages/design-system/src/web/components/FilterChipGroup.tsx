import type { ReactNode } from 'react'

export interface FilterChipOption {
  value: string
  label: string
  icon?: ReactNode
}

export interface FilterChipGroupProps {
  options: FilterChipOption[]
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}

export function FilterChipGroup({ options, value, onChange, className = '' }: FilterChipGroupProps) {
  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter(v => v !== optionValue)
        : [...value, optionValue],
    )
  }

  return (
    <div className={['flex items-center gap-2 flex-wrap', className].filter(Boolean).join(' ')}>
      {options.map(opt => {
        const selected = value.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={selected}
            className={[
              'h-[34px] inline-flex items-center gap-1.5 px-3 rounded-chip border text-label font-medium transition-colors',
              selected
                ? 'bg-brand-subtle border-brand-border text-brand'
                : 'bg-surface-raised border-border text-text-secondary hover:bg-surface-hover',
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

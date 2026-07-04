import { useId } from 'react'

type DatePickerState = 'default' | 'error' | 'success'

export interface DatePickerProps {
  label?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  state?: DatePickerState
  helperText?: string
  disabled?: boolean
  className?: string
}

const stateClass: Record<DatePickerState, string> = {
  default: 'border-border focus-within:border-border-focus',
  error:   'border-error-border focus-within:border-error-fg',
  success: 'border-success-border focus-within:border-success-fg',
}

const helperClass: Record<DatePickerState, string> = {
  default: 'text-text-tertiary',
  error:   'text-error-fg',
  success: 'text-success-fg',
}

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  state = 'default',
  helperText,
  disabled,
  className = '',
}: DatePickerProps) {
  const inputId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-label font-medium text-text-primary">
          {label}
        </label>
      )}
      <div
        className={[
          'flex items-center gap-2 h-10 px-3.5 rounded-input border bg-surface-raised',
          'transition-colors focus-within:shadow-focus-ring',
          stateClass[state],
          disabled ? 'bg-surface-disabled text-text-disabled cursor-not-allowed' : '',
          className,
        ].filter(Boolean).join(' ')}
      >
        <svg className="flex-none size-4 text-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M3 10h18M8 2v4M16 2v4" />
        </svg>
        <input
          id={inputId}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-body text-text-primary outline-none disabled:cursor-not-allowed"
        />
      </div>
      {helperText && (
        <p className={`text-caption ${helperClass[state]}`}>{helperText}</p>
      )}
    </div>
  )
}

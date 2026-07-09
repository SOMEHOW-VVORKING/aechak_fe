import { useId, type SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string
  placeholder?: string
  options: SelectOption[]
  error?: string
  onChange?: (value: string) => void
}

export function Select({
  label,
  placeholder,
  options,
  error,
  disabled,
  onChange,
  value,
  id,
  className = '',
  ...props
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-label font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          disabled={disabled}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className={[
            'w-full h-10 pl-3.5 pr-10 rounded-input border bg-surface-raised appearance-none outline-none',
            'text-body-sm text-text-primary transition-colors',
            'focus:border-border-focus focus:shadow-focus-ring',
            'disabled:bg-surface-disabled disabled:text-text-disabled disabled:cursor-not-allowed',
            !value ? 'text-text-placeholder' : '',
            error ? 'border-error-border' : 'border-border',
            className,
          ].filter(Boolean).join(' ')}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        >
          {placeholder && <option value="" disabled hidden>{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-icon"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {error && (
        <p id={`${selectId}-error`} className="text-caption text-error-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

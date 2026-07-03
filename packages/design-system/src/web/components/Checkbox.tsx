import { useEffect, useRef } from 'react'

export interface CheckboxProps {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  error?: boolean
  label?: string
  onChange?: (checked: boolean) => void
}

export function Checkbox({ checked, indeterminate = false, disabled, error, label, onChange }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label
      className={[
        'inline-flex items-center gap-2',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'relative flex size-5 flex-none items-center justify-center rounded-xs border-[1.5px] transition-colors',
          checked || indeterminate
            ? 'bg-brand border-brand'
            : error
              ? 'border-error-border'
              : 'border-border',
          disabled ? 'bg-surface-disabled border-border opacity-60' : '',
        ].filter(Boolean).join(' ')}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange?.(e.target.checked)}
          className="sr-only"
          aria-invalid={error || undefined}
        />
        {checked && !indeterminate && (
          <svg
            className="size-3.5 text-brand-on"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg
            className="size-3.5 text-brand-on"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
          </svg>
        )}
      </span>
      {label && (
        <span
          className={[
            'text-body-sm',
            disabled ? 'text-text-disabled' : error ? 'text-error-fg' : 'text-text-primary',
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </label>
  )
}

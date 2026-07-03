import { type InputHTMLAttributes, type ReactNode, useId } from 'react'

type InputState = 'default' | 'error' | 'success'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  helperText?: string
  state?: InputState
  leftAddon?: ReactNode
  rightAddon?: ReactNode
  clearable?: boolean
  onClear?: () => void
}

const stateClass: Record<InputState, string> = {
  default: 'border-border focus-within:border-border-focus',
  error:   'border-error-border focus-within:border-error-fg',
  success: 'border-success-border focus-within:border-success-fg',
}

const helperClass: Record<InputState, string> = {
  default: 'text-text-tertiary',
  error:   'text-error-fg',
  success: 'text-success-fg',
}

export function Input({
  label,
  helperText,
  state = 'default',
  leftAddon,
  rightAddon,
  clearable = false,
  onClear,
  id,
  className = '',
  disabled,
  value,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const showClear = clearable && !disabled && value !== '' && value !== undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-label font-medium text-text-primary"
        >
          {label}
        </label>
      )}
      <div
        className={[
          'flex items-center gap-2 h-10 px-4 rounded-input border bg-surface-raised',
          'transition-colors focus-within:shadow-focus-ring',
          stateClass[state],
          disabled ? 'bg-surface-disabled text-text-disabled cursor-not-allowed' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leftAddon && <span className="flex-none text-icon">{leftAddon}</span>}
        <input
          id={inputId}
          disabled={disabled}
          value={value}
          className="flex-1 min-w-0 bg-transparent text-body text-text-primary placeholder:text-text-placeholder outline-none disabled:cursor-not-allowed"
          {...props}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex-none text-icon hover:text-text-secondary transition-colors"
            aria-label="입력 초기화"
            tabIndex={-1}
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        {!showClear && rightAddon && <span className="flex-none text-icon">{rightAddon}</span>}
      </div>
      {helperText && (
        <p id={`${inputId}-helper`} className={`text-caption ${helperClass[state]}`}>
          {helperText}
        </p>
      )}
    </div>
  )
}

import { useId, type TextareaHTMLAttributes } from 'react'

type TextareaState = 'default' | 'error' | 'success'

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label?: string
  state?: TextareaState
  helperText?: string
  maxLength?: number
  onChange?: (value: string) => void
}

const stateClass: Record<TextareaState, string> = {
  default: 'border-border focus-within:border-border-focus focus-within:shadow-focus-ring',
  error:   'border-error-border focus-within:border-error-fg focus-within:shadow-focus-ring',
  success: 'border-success-border focus-within:border-success-fg focus-within:shadow-focus-ring',
}

const helperClass: Record<TextareaState, string> = {
  default: 'text-text-tertiary',
  error:   'text-error-fg',
  success: 'text-success-fg',
}

export function Textarea({
  label,
  state = 'default',
  helperText,
  maxLength,
  disabled,
  onChange,
  id,
  value,
  rows = 4,
  ...props
}: TextareaProps) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const charCount = typeof value === 'string' ? value.length : 0

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-label font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div
        className={[
          'relative rounded-input border bg-surface-raised transition-colors',
          stateClass[state],
          disabled ? 'bg-surface-disabled text-text-disabled cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
      >
        <textarea
          id={textareaId}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className="w-full resize-none bg-transparent px-3.5 py-3 text-body text-text-primary placeholder:text-text-placeholder outline-none disabled:cursor-not-allowed"
          aria-describedby={helperText ? `${textareaId}-helper` : undefined}
          aria-invalid={state === 'error' || undefined}
          {...props}
        />
        {maxLength != null && (
          <span className="absolute bottom-2.5 right-3.5 text-caption text-text-tertiary select-none pointer-events-none">
            {charCount}/{maxLength}
          </span>
        )}
      </div>
      {helperText && (
        <p id={`${textareaId}-helper`} className={`text-caption ${helperClass[state]}`}>
          {helperText}
        </p>
      )}
    </div>
  )
}

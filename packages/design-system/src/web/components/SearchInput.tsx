import { type InputHTMLAttributes, useId } from 'react'
import { ClearIcon } from './icons'

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = '검색',
  disabled,
  id,
  className = '',
  ...props
}: SearchInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const showClear = !disabled && value !== ''

  return (
    <div
      className={[
        'flex items-center gap-2 h-10 px-3.5 rounded-searchbar bg-surface-sunken',
        'transition-colors focus-within:bg-surface-raised focus-within:border focus-within:border-border-focus focus-within:shadow-focus-ring',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <svg
        className="flex-none size-4 text-icon-muted"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        id={inputId}
        type="search"
        disabled={disabled}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-body text-text-primary placeholder:text-text-placeholder outline-none disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear ?? (() => onChange(''))}
          className="flex-none text-icon-muted hover:text-text-secondary transition-colors"
          aria-label="검색어 지우기"
          tabIndex={-1}
        >
          <ClearIcon />
        </button>
      )}
    </div>
  )
}

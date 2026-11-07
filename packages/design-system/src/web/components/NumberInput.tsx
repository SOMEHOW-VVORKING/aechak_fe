import { type ChangeEvent, useEffect, useState } from 'react'

export interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  size?: 'sm' | 'md'
  disabled?: boolean
  /** 입력칸의 접근 가능한 이름. 한 화면에 여럿이면 각각 달라야 구분된다. */
  'aria-label'?: string
}

export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  size = 'md',
  disabled = false,
  'aria-label': ariaLabel = '값',
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value))

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  const canDecrease = !disabled && value - step >= min
  const canIncrease = !disabled && value + step <= max

  const btnSize = size === 'sm' ? 'size-[30px]' : 'size-10'
  const valWidth = size === 'sm' ? 'w-12' : 'w-16'
  const valText = size === 'sm' ? 'text-body-sm' : 'text-body'

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (raw !== '' && raw !== '-' && !/^-?\d*\.?\d*$/.test(raw)) return
    setLocalValue(raw)
    if (raw === '' || raw === '-') return
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) onChange(parsed)
  }

  function handleBlur() {
    const parsed = Number(localValue)
    const clamped = Number.isNaN(parsed) ? value : Math.min(max, Math.max(min, parsed))
    setLocalValue(String(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <div
      className={[
        'inline-flex items-center rounded-input border border-border',
        disabled ? 'opacity-60' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={!canDecrease}
        aria-label="감소"
        className={[
          btnSize,
          'flex items-center justify-center text-icon transition-colors',
          canDecrease ? 'hover:bg-surface-hover' : 'text-text-disabled cursor-not-allowed',
        ].join(' ')}
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`${valWidth} ${valText} bg-transparent text-center text-text-primary tabular-nums outline-none disabled:cursor-not-allowed`}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={!canIncrease}
        aria-label="증가"
        className={[
          btnSize,
          'flex items-center justify-center text-icon transition-colors',
          canIncrease ? 'hover:bg-surface-hover' : 'text-text-disabled cursor-not-allowed',
        ].join(' ')}
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

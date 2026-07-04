export interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  size = 'md',
  disabled = false,
}: NumberInputProps) {
  const canDecrease = !disabled && value - step >= min
  const canIncrease = !disabled && value + step <= max

  const btnSize = size === 'sm' ? 'size-[30px]' : 'size-10'
  const valWidth = size === 'sm' ? 'w-8' : 'w-11'
  const valText = size === 'sm' ? 'text-body-sm' : 'text-body'

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
      <span className={`${valWidth} ${valText} text-center text-text-primary tabular-nums`}>
        {value}
      </span>
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

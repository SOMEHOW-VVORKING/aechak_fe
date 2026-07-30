export interface ToggleProps {
  checked: boolean
  disabled?: boolean
  label?: string
  /** label을 시각적으로 붙이지 않고(예: 행 제목이 별도 span일 때) 스위치의 접근성 이름만 줄 때 사용. */
  ariaLabel?: string
  onChange?: (checked: boolean) => void
}

export function Toggle({ checked, disabled, label, ariaLabel, onChange }: ToggleProps) {
  return (
    <label
      className={[
        'inline-flex items-center gap-2',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={[
          'relative h-[26px] w-11 flex-none rounded-full transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:shadow-focus-ring',
          checked ? 'bg-brand' : 'bg-border-strong',
          disabled ? 'opacity-45 cursor-not-allowed' : '',
        ].filter(Boolean).join(' ')}
      >
        <span
          className={[
            'absolute top-[3px] left-[3px] size-5 rounded-full bg-surface-raised',
            'shadow-[0_1px_3px_rgba(28,26,23,0.25)] transition-transform duration-fast',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      {label && (
        <span
          className={[
            'text-label',
            disabled ? 'text-text-disabled' : 'text-text-secondary',
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </label>
  )
}

export interface RadioProps {
  checked: boolean
  disabled?: boolean
  label?: string
  name?: string
  value?: string
  onChange?: () => void
}

export function Radio({ checked, disabled, label, name, value, onChange }: RadioProps) {
  return (
    <label
      className={[
        'inline-flex items-center gap-2',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'relative flex size-[18px] flex-none items-center justify-center rounded-full transition-colors',
          checked
            ? 'border-[6px] border-brand bg-surface-raised'
            : 'border-[1.5px] border-border-strong',
          disabled ? 'opacity-60' : '',
        ].filter(Boolean).join(' ')}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="sr-only"
        />
      </span>
      {label && (
        <span
          className={[
            'text-body-sm',
            disabled ? 'text-text-disabled' : 'text-text-primary',
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </label>
  )
}

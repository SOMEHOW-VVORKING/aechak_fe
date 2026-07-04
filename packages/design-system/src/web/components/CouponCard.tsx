import type { ReactNode } from 'react'
import { Button } from './Button'

export interface CouponCardProps {
  discountLabel: string
  title: string
  condition?: string
  expiry?: string
  disabledReason?: ReactNode
  selected?: boolean
  disabled?: boolean
  onSelect?: () => void
  onClaim?: () => void
  claimLabel?: string
  name?: string
}

export function CouponCard({
  discountLabel,
  title,
  condition,
  expiry,
  disabledReason,
  selected = false,
  disabled = false,
  onSelect,
  onClaim,
  claimLabel = '받기',
  name,
}: CouponCardProps) {
  const isSelectable = !!onSelect

  const content = (
    <>
      {isSelectable && (
        <span
          className={[
            'relative flex size-5 flex-none items-center justify-center rounded-full transition-colors',
            disabled
              ? 'border-[1.5px] border-border bg-surface-disabled'
              : selected
                ? 'border-[6px] border-brand bg-surface-raised'
                : 'border-[1.5px] border-border-strong',
          ].join(' ')}
        >
          {isSelectable && (
            <input
              type="radio"
              name={name}
              checked={selected}
              disabled={disabled}
              onChange={onSelect}
              className="sr-only"
            />
          )}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-price-lg font-semibold ${disabled ? 'text-text-tertiary' : 'text-text-accent'}`}>
            {discountLabel}
          </span>
          <span className={`text-label ${disabled ? 'text-text-tertiary' : 'text-text-primary'}`}>{title}</span>
        </div>
        {disabled && disabledReason ? (
          <p className="text-caption text-text-tertiary mt-1.5">{disabledReason}</p>
        ) : (
          <>
            {condition && <p className="text-caption text-text-tertiary mt-1">{condition}</p>}
            {expiry && <p className="text-caption text-text-tertiary mt-0.5">{expiry}</p>}
          </>
        )}
      </div>
      {onClaim && (
        <Button variant="secondary" size="sm" onClick={onClaim} disabled={disabled} className="flex-none self-center">
          {claimLabel}
        </Button>
      )}
    </>
  )

  const cardClass = [
    'flex items-start gap-3 rounded-card border p-3.5 transition-colors',
    selected ? 'border-brand-border bg-surface-selected' : 'border-border-subtle bg-surface-raised',
    disabled ? 'opacity-70' : '',
  ].filter(Boolean).join(' ')

  if (isSelectable) {
    return (
      <label className={`${cardClass} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        {content}
      </label>
    )
  }

  return <div className={cardClass}>{content}</div>
}

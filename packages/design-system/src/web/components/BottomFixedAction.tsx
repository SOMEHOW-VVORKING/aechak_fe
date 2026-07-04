import type { ReactNode } from 'react'
import { Button } from './Button'

export interface BottomFixedActionPrimary {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export interface BottomFixedActionSecondary {
  label: string
  onClick: () => void
}

export interface BottomFixedActionProps {
  primary: BottomFixedActionPrimary
  secondary?: BottomFixedActionSecondary
  children?: ReactNode
}

// Sticky bottom CTA bar. Works both as the `footer` slot of `MobileScreen`
// (where the outer frame doesn't scroll, so it just sits at the end of the
// flex column) and standalone inside an ordinary scrolling page (where
// `sticky bottom-0` keeps it pinned to the viewport as the page scrolls).
export function BottomFixedAction({ primary, secondary, children }: BottomFixedActionProps) {
  return (
    <div
      className="sticky bottom-0 z-sticky flex flex-none flex-col gap-3 border-t border-border-subtle bg-surface-raised px-4 pt-3"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      {children}
      <div className="flex gap-3">
        {secondary && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          fullWidth={!secondary}
          className={secondary ? 'flex-1' : ''}
          loading={primary.loading}
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </Button>
      </div>
    </div>
  )
}

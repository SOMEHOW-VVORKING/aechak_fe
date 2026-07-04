import type { ReactNode } from 'react'
import { ClearIcon } from './icons'

export interface ChipProps {
  children: ReactNode
  onRemove?: () => void
  className?: string
}

export function Chip({ children, onRemove, className = '' }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 h-6 px-2 rounded-chip bg-surface-sunken text-badge text-text-secondary whitespace-nowrap',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex-none text-icon-muted hover:text-text-secondary transition-colors"
          aria-label="삭제"
        >
          <ClearIcon className="size-3" strokeWidth={2.5} />
        </button>
      )}
    </span>
  )
}

import type { ReactNode } from 'react'
import { getInteractiveDivProps } from './interactive-div'

export interface ListItemProps {
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  className?: string
}

export function ListItem({ title, subtitle, leading, trailing, onClick, className = '' }: ListItemProps) {
  const isInteractive = !!onClick

  return (
    <div
      {...getInteractiveDivProps(onClick)}
      className={[
        'flex items-center gap-3.5 min-h-[52px] py-2 text-text-primary',
        isInteractive ? 'cursor-pointer hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {leading && <span className="flex-none text-icon">{leading}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-body truncate">{title}</p>
        {subtitle && <p className="text-body-sm text-text-tertiary truncate">{subtitle}</p>}
      </div>
      {trailing && (
        <span className="flex-none inline-flex items-center gap-1.5 text-body-sm text-text-tertiary">
          {trailing}
        </span>
      )}
    </div>
  )
}

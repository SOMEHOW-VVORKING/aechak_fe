import { type HTMLAttributes, type ReactNode } from 'react'
import { getInteractiveDivProps } from './interactive-div'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  selected?: boolean
  padding?: 'none' | 'md'
  onClick?: () => void
}

export function Card({ children, selected, padding = 'none', onClick, className = '', ...props }: CardProps) {
  const isInteractive = !!onClick

  return (
    <div
      {...getInteractiveDivProps(onClick)}
      className={[
        'rounded-card border bg-surface-raised',
        selected ? 'border-brand-border' : 'border-border-subtle',
        padding === 'md' ? 'p-3.5' : '',
        isInteractive
          ? 'cursor-pointer transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring'
          : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

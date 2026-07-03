import { type ReactNode } from 'react'

export interface FilterBarProps {
  children: ReactNode
  className?: string
}

export function FilterBar({ children, className = '' }: FilterBarProps) {
  return (
    <div
      className={[
        'flex items-center gap-2 flex-wrap',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}

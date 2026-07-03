import { type ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, actions, className = '' }: PageHeaderProps) {
  return (
    <div
      className={[
        'flex items-end justify-between gap-4 mb-[18px]',
        className,
      ].filter(Boolean).join(' ')}
    >
      <h1 className="text-title font-semibold text-text-primary tracking-tight">{title}</h1>
      {actions && (
        <div className="flex items-center gap-2 flex-none">{actions}</div>
      )}
    </div>
  )
}

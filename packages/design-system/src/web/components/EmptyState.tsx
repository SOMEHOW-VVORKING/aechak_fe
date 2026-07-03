import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 text-center ${className}`}>
      {icon && (
        <div className="size-12 rounded-full bg-surface-sunken flex items-center justify-center text-icon-muted">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-body font-medium text-text-primary">{title}</p>
        {description && <p className="text-body-sm text-text-tertiary">{description}</p>}
      </div>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

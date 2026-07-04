import type { ReactNode } from 'react'

type StepStatus = 'active' | 'done' | 'todo'

export interface FormSectionProps {
  title: string
  step?: number
  stepStatus?: StepStatus
  children: ReactNode
  className?: string
}

const stepClass: Record<StepStatus, string> = {
  active: 'bg-brand text-brand-on',
  done: 'bg-success text-success-on',
  todo: 'bg-surface-sunken text-text-tertiary border border-border',
}

export function FormSection({ title, step, stepStatus = 'active', children, className = '' }: FormSectionProps) {
  return (
    <div className={['rounded-card border border-border-subtle bg-surface-raised overflow-hidden', className].filter(Boolean).join(' ')}>
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border-subtle">
        {step !== undefined && (
          <span className={`size-6 flex-none rounded-full text-badge font-semibold inline-flex items-center justify-center ${stepClass[stepStatus]}`}>
            {stepStatus === 'done' ? (
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 13 4 4L19 7" />
              </svg>
            ) : step}
          </span>
        )}
        <span className="flex-1 min-w-0 text-subheading font-semibold text-text-primary">{title}</span>
      </div>
      <div className="p-4 grid gap-4">{children}</div>
    </div>
  )
}

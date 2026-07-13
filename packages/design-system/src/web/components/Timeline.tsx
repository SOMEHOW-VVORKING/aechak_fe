export type TimelineStepStatus = 'done' | 'active' | 'todo'

export interface TimelineStep {
  label: string
  sublabel?: string
  status: TimelineStepStatus
}

export interface TimelineProps {
  steps: TimelineStep[]
  className?: string
}

const dotClass: Record<TimelineStepStatus, string> = {
  done: 'bg-success-fg',
  active: 'bg-brand',
  todo: 'bg-border',
}

const lineClass: Record<TimelineStepStatus, string> = {
  done: 'bg-success-fg',
  active: 'bg-border-subtle',
  todo: 'bg-border-subtle',
}

const labelClass: Record<TimelineStepStatus, string> = {
  done: 'font-semibold text-text-primary',
  active: 'font-semibold text-brand',
  todo: 'font-normal text-text-tertiary',
}

export function Timeline({ steps, className = '' }: TimelineProps) {
  return (
    <ol className={['flex flex-col', className].filter(Boolean).join(' ')}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        return (
          <li key={i} className="flex gap-3">
            <div className="flex w-3 flex-col items-center">
              <span className={`size-3 flex-none rounded-full ${dotClass[step.status]}`} />
              {!isLast && <span className={`mt-0.5 w-0.5 flex-1 ${lineClass[step.status]}`} />}
            </div>
            <div className={isLast ? '' : 'pb-5'}>
              <p className={`text-body-sm ${labelClass[step.status]}`}>{step.label}</p>
              {step.sublabel && (
                <p className="mt-0.5 text-caption text-text-tertiary">{step.sublabel}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

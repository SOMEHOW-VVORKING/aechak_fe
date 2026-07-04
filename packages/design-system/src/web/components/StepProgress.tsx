export interface StepProgressProps {
  current: number
  total: number
}

export function StepProgress({ current, total }: StepProgressProps) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map(step => (
        <div
          key={step}
          className={[
            'h-1 flex-1 rounded-full transition-colors duration-base',
            step < current && 'bg-success',
            step === current && 'bg-brand',
            step > current && 'bg-surface-sunken',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </div>
  )
}

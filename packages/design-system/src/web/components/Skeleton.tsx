interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circle' | 'rect'
}

export function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  const shape =
    variant === 'circle' ? 'rounded-full' :
    variant === 'text'   ? 'h-4 rounded' :
    'rounded-card'

  return (
    <div
      className={`animate-skeleton ${shape} ${className}`}
      style={{
        background: 'linear-gradient(90deg, var(--neutral-surface) 25%, var(--surface-hover) 50%, var(--neutral-surface) 75%)',
        backgroundSize: '200% 100%',
      }}
      aria-hidden="true"
    />
  )
}

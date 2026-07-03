export interface BadgeProps {
  count?: number
  dot?: boolean
  max?: number
}

export function Badge({ count, dot = false, max = 99 }: BadgeProps) {
  if (dot) {
    return <span className="size-2 rounded-full bg-accent flex-none" aria-hidden="true" />
  }
  if (count == null || count <= 0) return null
  return (
    <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-on text-badge font-semibold inline-flex items-center justify-center tabular-nums flex-none">
      {count > max ? `${max}+` : count}
    </span>
  )
}

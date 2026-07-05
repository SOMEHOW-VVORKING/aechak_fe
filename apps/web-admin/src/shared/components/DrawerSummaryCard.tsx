import type { ReactNode } from 'react'

interface DrawerSummaryCardProps {
  pills: ReactNode
  children?: ReactNode
}

export function DrawerSummaryCard({ pills, children }: DrawerSummaryCardProps) {
  return (
    <div className="space-y-3 rounded-lg bg-surface-sunken p-4">
      <div className="flex flex-wrap items-center gap-1.5">{pills}</div>
      {children}
    </div>
  )
}

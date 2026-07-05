import type { ReactNode } from 'react'

export interface SummaryGridItem {
  label: string
  value: ReactNode
}

export function SummaryGrid({ items }: { items: SummaryGridItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(item => (
        <div key={item.label}>
          <dt className="text-caption text-text-tertiary">{item.label}</dt>
          <dd className="text-body-sm font-medium text-text-primary tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

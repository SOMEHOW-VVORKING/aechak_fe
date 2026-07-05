import type { ReactNode } from 'react'
import type { HistoryEntry } from '@aechak/domain'

interface HistoryListProps<T extends HistoryEntry> {
  items: T[]
  renderLabel?: (item: T) => ReactNode
  emptyLabel?: string
}

export function HistoryList<T extends HistoryEntry>({ items, renderLabel, emptyLabel }: HistoryListProps<T>) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-body-sm text-text-tertiary">{emptyLabel}</p> : null
  }

  return (
    <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-sunken">
      {items.map((item, index) => (
        <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-body-sm">
          <span className="flex items-center gap-2 text-text-primary">
            {renderLabel ? renderLabel(item) : item.label}
          </span>
          <span className="flex-none text-caption text-text-tertiary tabular-nums">{item.date}</span>
        </li>
      ))}
    </ul>
  )
}

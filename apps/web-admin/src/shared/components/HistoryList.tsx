import type { ReactNode } from 'react'
import type { HistoryEntry } from '@aechak/domain'

interface HistoryListProps<T extends HistoryEntry> {
  items: T[]
  renderLabel?: (item: T) => ReactNode
  /**
   * 라벨 아래 줄에 덧붙이는 보조 설명(심사 이력의 건별 반려 사유 등). 값이 비면 줄 자체를
   * 그리지 않으므로, 이 prop을 주지 않는 기존 호출부는 한 줄 레이아웃 그대로다(하위 호환).
   */
  renderDescription?: (item: T) => ReactNode
  emptyLabel?: string
}

export function HistoryList<T extends HistoryEntry>({
  items,
  renderLabel,
  renderDescription,
  emptyLabel,
}: HistoryListProps<T>) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-body-sm text-text-tertiary">{emptyLabel}</p> : null
  }

  return (
    <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-sunken">
      {items.map((item, index) => {
        const description = renderDescription?.(item)
        return (
          <li key={index} className="px-3 py-2 text-body-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-text-primary">
                {renderLabel ? renderLabel(item) : item.label}
              </span>
              <span className="flex-none text-caption text-text-tertiary tabular-nums">
                {item.date}
              </span>
            </div>
            {description ? (
              <p className="mt-1 break-keep text-caption text-text-secondary">{description}</p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

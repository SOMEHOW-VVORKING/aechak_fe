export interface TabItem {
  key: string
  label: string
  badge?: number
}

export interface TabsProps {
  tabs: TabItem[]
  activeKey: string
  onSelect: (key: string) => void
  className?: string
}

export function Tabs({ tabs, activeKey, onSelect, className = '' }: TabsProps) {
  return (
    <div role="tablist" className={['flex border-b border-border-subtle', className].filter(Boolean).join(' ')}>
      {tabs.map(tab => {
        const selected = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(tab.key)}
            className={[
              'px-3.5 py-2.5 text-label font-medium border-b-2 -mb-px transition-colors',
              selected ? 'text-brand border-brand' : 'text-text-secondary border-transparent hover:text-text-primary',
            ].join(' ')}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-1 tabular-nums">{tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

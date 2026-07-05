import type { ReactNode } from 'react'

export interface TabBarItem {
  key: string
  label: string
  icon: ReactNode
}

export interface TabBarProps {
  tabs: TabBarItem[]
  activeKey: string
  onSelect: (key: string) => void
  className?: string
}

// Bottom tab navigation for mobile-web (and later thin-WebView) screens —
// the web counterpart of native `TabBar`. Unlike the native version, `icon`
// is a plain `ReactNode` rather than an `(isActive) => ReactNode` render
// prop: web icon sets (e.g. lucide-react) recolor via `currentColor`
// instead of swapping between separate filled/outline glyphs per state.
// Meant to be passed into `MobileScreen`'s `footer` slot so it participates
// in the same safe-area padding as `BottomFixedAction`.
export function TabBar({ tabs, activeKey, onSelect, className = '' }: TabBarProps) {
  return (
    <nav
      className={[
        'flex flex-none border-t border-border-subtle bg-surface-raised',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            onClick={() => onSelect(tab.key)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors"
          >
            <span className={`size-6 ${isActive ? 'text-brand' : 'text-icon'}`}>{tab.icon}</span>
            <span className={`text-badge ${isActive ? 'font-semibold text-brand' : 'text-text-tertiary'}`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

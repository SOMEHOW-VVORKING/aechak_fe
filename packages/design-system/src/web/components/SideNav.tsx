import type { ReactNode } from 'react'

export interface NavItem {
  key: string
  label: string
  icon: ReactNode
  badge?: number
  href?: string
}

export interface NavGroup {
  key: string
  label?: string
  items: NavItem[]
}

interface SideNavProps {
  groups: NavGroup[]
  activeKey: string
  onSelect: (key: string) => void
  header?: ReactNode
  footer?: ReactNode
  className?: string
}

const itemBase = [
  'w-full flex items-center gap-3 px-4 py-2.5 rounded-md mx-2 text-body-sm font-medium transition-colors text-left',
  'focus-visible:outline-none focus-visible:shadow-focus-ring',
].join(' ')

const itemActive = 'bg-brand-subtle text-brand font-semibold'
const itemIdle = 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'

export function SideNav({ groups, activeKey, onSelect, header, footer, className = '' }: SideNavProps) {
  return (
    <nav
      className={[
        'flex flex-col h-full w-56 bg-surface-raised border-r border-border-subtle select-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {header && <div className="px-4 py-5 border-b border-border-subtle">{header}</div>}

      <div className="flex-1 overflow-y-auto py-3 space-y-1">
        {groups.map((group) => (
          <div key={group.key}>
            {group.label && (
              <p className="px-4 py-2 text-caption font-semibold text-text-tertiary uppercase tracking-wide">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = item.key === activeKey
              const cls = `${itemBase} ${isActive ? itemActive : itemIdle}`
              const innerContent = (
                <>
                  <span className={`size-5 flex-none ${isActive ? 'text-brand' : 'text-icon'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-brand-on text-badge font-semibold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </>
              )

              // Render as <a> when href is provided (better semantics + keyboard nav)
              if (item.href) {
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    className={cls}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {innerContent}
                  </a>
                )
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={cls}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {innerContent}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {footer && <div className="px-4 py-4 border-t border-border-subtle">{footer}</div>}
    </nav>
  )
}

import type { ReactNode } from 'react'

export interface NavItem {
  key: string
  label: string
  icon: ReactNode
  /** 숫자는 미처리 건수(brand 강조), 문자는 상태 표시(예: '준비 중', muted). */
  badge?: number | string
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
  /**
   * 접힘 상태. `onCollapsedChange`가 없으면 `true`일 때 완전히 숨김(`null`, 기존 동작 —
   * 하위 호환용). `onCollapsedChange`가 있으면 `true`일 때 좁은 아이콘 레일을 렌더링한다.
   */
  collapsed?: boolean
  /**
   * 주어지면 SideNav가 스스로 접기/펼치기 토글 버튼을 그린다(펼침 상태에선 헤더 옆,
   * 접힘 상태에선 레일 안). 없으면 토글 버튼 없이 `collapsed` 값대로만 렌더링(하위 호환).
   */
  onCollapsedChange?: (collapsed: boolean) => void
}

const itemBase = [
  'w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-body-sm font-medium transition-colors text-left',
  'focus-visible:outline-none focus-visible:shadow-focus-ring',
].join(' ')

const itemActive = 'bg-brand-subtle text-brand font-semibold'
const itemIdle = 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'

const toggleButtonBase = [
  'flex flex-none items-center justify-center rounded-md text-icon transition-colors',
  'hover:bg-surface-hover hover:text-text-primary',
  'focus-visible:outline-none focus-visible:shadow-focus-ring',
].join(' ')

// Drawer/Accordion/CategoryTree와 같은 인라인 SVG 컨벤션(라이브러리 의존 없는 자체 chevron).
function ToggleChevron({ pointing }: { pointing: 'left' | 'right' }) {
  return (
    <svg
      className={`size-4 ${pointing === 'right' ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

// 숫자 배지는 처리할 건수라 brand로 띄우고, 문자 배지는 항목의 상태(예: '준비 중')라 muted로
// 가라앉힌다 — 둘을 같은 색으로 그리면 "준비 중"이 처리할 일처럼 읽힌다.
function NavBadge({ badge }: { badge?: number | string }) {
  if (typeof badge === 'string') {
    if (!badge) return null
    return (
      <span className="flex-none rounded-full border border-muted-border bg-muted-surface px-2 py-0.5 text-badge font-semibold text-muted">
        {badge}
      </span>
    )
  }

  if (badge == null || badge <= 0) return null

  return (
    <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-brand-on text-badge font-semibold flex items-center justify-center">
      {badge > 99 ? '99+' : badge}
    </span>
  )
}

export function SideNav({
  groups,
  activeKey,
  onSelect,
  header,
  footer,
  className = '',
  collapsed = false,
  onCollapsedChange,
}: SideNavProps) {
  if (collapsed) {
    if (!onCollapsedChange) return null

    return (
      <nav
        className={[
          'flex h-full w-14 flex-none flex-col items-center gap-2 border-r border-border-subtle bg-surface-raised py-4 select-none',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          aria-label="메뉴 펼치기"
          className={`size-9 ${toggleButtonBase}`}
        >
          <ToggleChevron pointing="right" />
        </button>
      </nav>
    )
  }

  return (
    <nav
      className={[
        'flex flex-col h-full w-64 bg-surface-raised border-r border-border-subtle select-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(header || onCollapsedChange) && (
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border-subtle">
          {header && <div className="min-w-0 flex-1">{header}</div>}
          {onCollapsedChange && (
            <button
              type="button"
              onClick={() => onCollapsedChange(true)}
              aria-label="메뉴 접기"
              className={`size-8 ${toggleButtonBase}`}
            >
              <ToggleChevron pointing="left" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {groups.map((group) => (
          <div key={group.key}>
            {group.label && (
              <p className="px-2 py-2 text-caption font-semibold text-text-tertiary uppercase tracking-wide">
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
                  <NavBadge badge={item.badge} />
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

import { useId, type ReactNode } from 'react'

export interface NavItem {
  key: string
  label: string
  icon: ReactNode
  /** 처리 대기 건수 등 서버가 채우는 숫자 배지. `tag`와 겸할 수 있다(쓰임이 서로 다르다). */
  badge?: number
  /**
   * 라벨 옆에 **글자로** 붙는 상태 꼬리표(예: `'준비 중'`). 숫자 배지와 별개 필드인 이유:
   * 하나는 "일이 몇 건 쌓였다"이고 다른 하나는 "이 목적지가 아직 열리지 않았다"라 한 자리에
   * 겹쳐 쓸 수 없다. 색이나 점으로만 구별하면 운영자가 알아보지 못하므로 글자로 적는다 —
   * 버튼 접근명에도 포함되어 스크린리더가 "항목 이름 + 꼬리표"로 읽는다.
   */
  tag?: string
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

// 꼬리표(`tag`)는 "이 목적지가 아직 열리지 않았다"라 muted로 가라앉히고, 숫자 배지(`badge`)는
// "처리할 일이 몇 건 쌓였다"라 brand로 띄운다 — 둘을 같은 색·같은 자리에 그리면 "준비 중"이
// 처리할 일처럼 읽힌다. 그래서 한 필드를 겸하게 하지 않고 자리도 따로 쓴다(꼬리표가 먼저).
function NavTag({ tag }: { tag?: string }) {
  if (tag == null || tag === '') return null

  return (
    <span className="flex-none rounded-full border border-muted-border bg-muted-surface px-2 py-0.5 text-badge font-semibold text-muted">
      {tag}
    </span>
  )
}

function NavBadge({ badge }: { badge?: number }) {
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
  // 그룹 머리글을 그 그룹의 항목들과 프로그램으로 묶는 데 쓴다(아래 role="group" 주석).
  // 훅이라 collapsed 분기보다 **위**에 있어야 한다.
  const groupIdPrefix = useId()

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
        {/* 머리글이 있는 그룹은 `role="group"` + `aria-labelledby`로 항목들과 묶는다. 보기에는
            머리글 아래 항목이 모여 있지만 그것은 순서일 뿐이라, 묶지 않으면 스크린리더는 "운영"을
            읽고 지나간 뒤 버튼 12개를 평평하게 읽어 어느 항목이 어느 그룹 소속인지 전하지 못한다.
            그룹 구성 자체가 운영자가 보는 정보이므로(nav 복원 SCRUM-304) 글자로만 두지 않는다. */}
        {groups.map((group, index) => {
          const labelId = group.label ? `${groupIdPrefix}nav-group-${index}` : undefined

          return (
            <div
              key={group.key}
              role={labelId ? 'group' : undefined}
              aria-labelledby={labelId}
            >
              {group.label && (
                <p
                  id={labelId}
                  className="px-2 py-2 text-caption font-semibold text-text-tertiary uppercase tracking-wide"
                >
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
                    <NavTag tag={item.tag} />
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
          )
        })}
      </div>

      {footer && <div className="px-4 py-4 border-t border-border-subtle">{footer}</div>}
    </nav>
  )
}

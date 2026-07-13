import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

// 설정 그룹(라벨 + 카드). 설정 홈·알림·동의 화면이 공유하는 목업의 set-group/set-card 패턴.
export function SettingsGroup({
  label,
  footnote,
  children,
}: {
  label?: string
  footnote?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      {label && <p className="px-1 text-label font-semibold text-text-secondary">{label}</p>}
      <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-raised">
        {children}
      </div>
      {footnote && (
        <p className="px-1 text-caption leading-relaxed text-text-tertiary">{footnote}</p>
      )}
    </section>
  )
}

// 이동형 설정 행(아이콘 + 라벨 + 우측 값/배지 + chevron). onClick 있으면 클릭 가능.
export function SettingsNavRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon?: ReactNode
  label: string
  value?: ReactNode
  onClick?: () => void
}) {
  const content = (
    <>
      {icon && <span className="flex size-5 flex-none items-center justify-center text-icon">{icon}</span>}
      <span className="flex-1 text-body text-text-primary">{label}</span>
      {value && <span className="flex items-center gap-1.5 text-body-sm text-text-tertiary">{value}</span>}
      {onClick && <ChevronRight className="size-[18px] flex-none text-icon-muted" />}
    </>
  )

  if (!onClick) {
    return (
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle">
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle"
    >
      {content}
    </button>
  )
}

// 설정 행 안에 라벨 + 보조 설명 + 우측 컨트롤(토글 등)을 세로로 배치하는 행.
export function SettingsControlRow({
  title,
  description,
  control,
  disabled,
}: {
  title: string
  description?: string
  control: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="flex min-h-[52px] items-start gap-3 px-4 py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={['text-body', disabled ? 'text-text-disabled' : 'text-text-primary'].join(' ')}>
          {title}
        </span>
        {description && (
          <span className="text-caption leading-relaxed text-text-tertiary">{description}</span>
        )}
      </div>
      <span className="flex-none pt-0.5">{control}</span>
    </div>
  )
}

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, ListItem } from '@aechak/design-system/web'

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
      <Card className="overflow-hidden">{children}</Card>
      {footnote && (
        <p className="px-1 text-caption leading-relaxed text-text-tertiary">{footnote}</p>
      )}
    </section>
  )
}

// 이동형 설정 행(아이콘 + 라벨 + 우측 값/배지 + chevron). DS ListItem(마이페이지 메뉴 행과 같은 컴포넌트)에
// 카드 안쪽 패딩과 행 사이 구분선만 더한다. onClick 있으면 클릭 가능 + chevron.
// 간격/세로 패딩은 목업 치수(gap 12px, py 10px)를 유지한다 — ListItem 자체 gap-3.5/py-2가 스타일시트에서
// 뒤에 오므로 `!`로 덮는다(E2E 스크린샷 기준선 유지).
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
  return (
    <ListItem
      leading={icon}
      title={label}
      trailing={onClick ? <ChevronRight className="size-[18px] text-icon-muted" /> : value}
      onClick={onClick}
      className="!gap-3 px-4 !py-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border-subtle"
    />
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

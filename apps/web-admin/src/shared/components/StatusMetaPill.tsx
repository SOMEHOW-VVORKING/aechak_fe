import type { LucideIcon } from 'lucide-react'
import { StatusPill } from '@aechak/design-system/web'
import type { StatusPillVariant } from '@aechak/design-system/web'

export interface StatusMeta {
  label: string
  variant: StatusPillVariant
  icon?: LucideIcon
}

/** 상태 enum → {라벨, 색, 아이콘} 메타 하나로 테이블 컬럼과 상세 드로어에 같은 pill을 그린다. */
export function StatusMetaPill({ meta: { label, variant, icon: Icon } }: { meta: StatusMeta }) {
  return (
    <StatusPill variant={variant}>
      {Icon && <Icon className="size-3" />}
      {label}
    </StatusPill>
  )
}

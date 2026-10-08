import { Briefcase, User } from 'lucide-react'
import type { SellerAccount } from '@aechak/domain'
import { StatusMetaPill } from './StatusMetaPill'
import type { StatusMeta } from './StatusMetaPill'

type SellerType = SellerAccount['sellerType']

// AGENTS.md §4: 사업자=neutral, 개인=info(대등 쌍이라 muted 금지).
const sellerTypeMeta: Record<SellerType, StatusMeta> = {
  business: { label: '사업자', variant: 'neutral', icon: Briefcase },
  individual: { label: '개인', variant: 'info', icon: User },
}

/** 입점 신청 마스킹 프로젝션은 sellerType이 비어 있을 수 있어 개인으로 본다(기존 표시 동작 유지). */
function metaOf(sellerType: SellerType | undefined) {
  return sellerType === 'business' ? sellerTypeMeta.business : sellerTypeMeta.individual
}

/** 드로어 부제용 긴 라벨 — '사업자 셀러' / '개인 셀러'. */
export function sellerTypeLabel(sellerType: SellerType | undefined) {
  return `${metaOf(sellerType).label} 셀러`
}

export function SellerTypePill({
  sellerType,
  long,
}: {
  sellerType: SellerType | undefined
  long?: boolean
}) {
  const meta = metaOf(sellerType)
  return <StatusMetaPill meta={long ? { ...meta, label: sellerTypeLabel(sellerType) } : meta} />
}

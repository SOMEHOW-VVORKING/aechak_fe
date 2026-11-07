import { Briefcase, User } from 'lucide-react'
import { StatusMetaPill } from './StatusMetaPill'
import type { StatusMeta } from './StatusMetaPill'

/**
 * 이 pill이 쓰는 굵은 분류 축. `SellerAccount`에서 따오지 않고 여기 직접 적는다 — 셀러 계정
 * 타입은 서버 계약을 따라 세 유형(개인 일반/개인 사업자/법인 사업자)과 "유형 미확인"(신청서 없음)을
 * 들게 됐고, 그 네 값을 이 두 값 축에 그대로 끼우면 Record 키가 깨진다(SCRUM-362).
 * 네 값을 보여줘야 하는 화면은 자기 메타를 들고 `StatusMetaPill`을 직접 쓴다.
 */
export type SellerType = 'business' | 'individual'

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

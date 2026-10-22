import type { SnsPetResult, SnsPetSummaryResult } from '@aechak/api'
import { petAge } from '@/shared/pet'

/** 프로필 머리말 펫 태그. 생년월이 있으면 `품종 / N살`, 없으면 품종만(카피 구분자는 /). */
export function petTagLabel(pet: SnsPetResult): string {
  if (pet.birthYearMonth == null) return pet.breedLabel
  const [year, month] = pet.birthYearMonth.split('-').map(Number)
  return `${pet.breedLabel} / ${petAge(year, month)}살`
}

/** 목록 행 펫 요약. 펫이 둘 이상이면 `품종 외 N`(N = activePetCount - 1). */
export function petSummaryLabel(summary: SnsPetSummaryResult): string {
  return summary.activePetCount > 1
    ? `${summary.breedLabel} 외 ${summary.activePetCount - 1}`
    : summary.breedLabel
}

/** 관리 목록 날짜. createdAt은 오프셋 없는 KST LocalDateTime이라 문자열에서 월, 일만 읽는다. */
export function relationDateLabel(createdAt: string): string {
  const [, month, day] = createdAt.slice(0, 10).split('-').map(Number)
  return `${month}월 ${day}일`
}

import type { SnsPetResult, SnsPetSummaryResult } from '@aechak/api'
import { petAge } from '@/shared/pet'

/**
 * 펫 태그. 생년월이 있으면 `품종 / N살`, 없으면 품종만(카피 구분자는 /).
 * 프로필 머리말은 오늘 기준이고 게시물은 게시 시각을 at으로 넘겨 게시 당시 나이를 쓴다(A5).
 */
export function petTagLabel(pet: SnsPetResult, at?: Date): string {
  if (pet.birthYearMonth == null) return pet.breedLabel
  const [year, month] = pet.birthYearMonth.split('-').map(Number)
  return `${pet.breedLabel} / ${petAge(year, month, at)}살`
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

/** 게시 시각(오프셋 없는 KST LocalDateTime)의 날짜. 기기 시간대로 다시 해석하지 않게 문자열에서 읽는다. */
export function postDate(createdAt: string): Date {
  const [year, month, day] = createdAt.slice(0, 10).split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

/** 상세의 게시 시각. `2026.10.22 오후 2:14` */
export function postDateLabel(createdAt: string): string {
  const [date = '', time = ''] = createdAt.split('T')
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const meridiem = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${date.replaceAll('-', '.')} ${meridiem} ${hour12}:${String(minute).padStart(2, '0')}`
}

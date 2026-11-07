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

/**
 * 피드 카드의 상대 시각. createdAt은 오프셋 없는 KST라 KST로 읽어 지금과 뺀다(기기 시간대로 해석하지 않는다).
 * 일주일이 지나면 날짜를 쓴다.
 */
export function relativeTimeLabel(createdAt: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(`${createdAt}+09:00`)) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return createdAt.slice(0, 10).replaceAll('-', '.')
}

/** 상세의 게시 시각. `2026.10.22 오후 2:14` */
export function postDateLabel(createdAt: string): string {
  const [date = '', time = ''] = createdAt.split('T')
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const meridiem = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${date.replaceAll('-', '.')} ${meridiem} ${hour12}:${String(minute).padStart(2, '0')}`
}

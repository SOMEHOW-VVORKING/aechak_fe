import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { petSummaryLabel, petTagLabel, postDate, postDateLabel, relationDateLabel } from '../sns.format'

describe('sns.format', () => {
  beforeAll(() => {
    vi.setSystemTime(new Date(2026, 6, 15))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('[AC-SNS01-003] 펫 태그는 생년월이 있으면 품종 / 나이, 없으면 품종만 쓴다', () => {
    // 고정한 오늘 2026년 7월: 2020-11생은 생일 전이라 5살.
    expect(petTagLabel({ breedLabel: '푸들', birthYearMonth: '2020-11' })).toBe('푸들 / 5살')
    expect(petTagLabel({ breedLabel: '말티즈', birthYearMonth: null })).toBe('말티즈')
  })

  it('[AC-SNS01-003] 나이는 오늘 날짜로 계산한다(생일이 지나면 한 살 늘어난다)', () => {
    vi.setSystemTime(new Date(2026, 10, 1))
    expect(petTagLabel({ breedLabel: '푸들', birthYearMonth: '2020-11' })).toBe('푸들 / 6살')
    vi.setSystemTime(new Date(2026, 6, 15))
  })

  it('[AC-SNS01-016] 펫 요약은 둘 이상이면 품종 외 N이다', () => {
    expect(petSummaryLabel({ breedLabel: '골든리트리버', activePetCount: 1 })).toBe('골든리트리버')
    expect(petSummaryLabel({ breedLabel: '골든리트리버', activePetCount: 3 })).toBe('골든리트리버 외 2')
  })

  it('[AC-SNS01-022] 관리 목록 날짜는 오프셋 없는 KST 시각에서 월, 일만 읽는다', () => {
    expect(relationDateLabel('2026-06-09T23:30:00')).toBe('6월 9일')
  })

  it('[AC-SNS02-017] 게시물 펫 태그는 오늘이 아니라 게시 시각 기준 나이다', () => {
    // 고정한 오늘은 2026년 7월이지만 2027-01-05 게시물의 2020-11생은 생일이 지난 6살이다.
    expect(petTagLabel({ breedLabel: '푸들', birthYearMonth: '2020-11' }, postDate('2027-01-05T08:00:00'))).toBe('푸들 / 6살')
    expect(petTagLabel({ breedLabel: '푸들', birthYearMonth: '2020-11' }, postDate('2025-10-31T23:59:00'))).toBe('푸들 / 4살')
  })

  it('게시 시각은 오전, 오후 12시간제로 쓴다', () => {
    expect(postDateLabel('2026-10-22T09:30:00')).toBe('2026.10.22 오전 9:30')
    expect(postDateLabel('2026-10-22T00:05:00')).toBe('2026.10.22 오전 12:05')
    expect(postDateLabel('2026-10-22T12:00:00')).toBe('2026.10.22 오후 12:00')
    expect(postDateLabel('2026-06-21T14:14:59')).toBe('2026.06.21 오후 2:14')
  })
})

import { describe, expect, it } from 'vitest'
import { FAQ_CATEGORIES, FAQ_ITEMS, GUIDELINE_REVISION, filterFaq } from '../settings.mock'

describe('settings.mock — FAQ 필터', () => {
  it('[AC-SETTINGS-001] 카테고리 all + 빈 검색어는 전체 항목을 반환한다', () => {
    expect(filterFaq(FAQ_ITEMS, 'all', '')).toHaveLength(FAQ_ITEMS.length)
    expect(filterFaq(FAQ_ITEMS, 'all', '   ')).toHaveLength(FAQ_ITEMS.length)
  })

  it('[AC-SETTINGS-002] 카테고리를 고르면 해당 카테고리 항목만 남는다', () => {
    const order = filterFaq(FAQ_ITEMS, 'order', '')
    expect(order.length).toBeGreaterThan(0)
    expect(order.every(item => item.category === 'order')).toBe(true)
  })

  it('[AC-SETTINGS-003] 검색어는 질문/답변에 부분 일치하고 대소문자를 무시한다', () => {
    const byUpper = filterFaq(FAQ_ITEMS, 'all', 'Apple')
    const byLower = filterFaq(FAQ_ITEMS, 'all', 'apple')
    expect(byUpper).toEqual(byLower)
    expect(byUpper.length).toBeGreaterThan(0)
  })

  it('[AC-SETTINGS-004] 카테고리와 검색어는 AND로 함께 걸린다', () => {
    // '탈퇴'는 account 카테고리 답변에만 등장 → order 카테고리에서는 0건.
    expect(filterFaq(FAQ_ITEMS, 'account', '탈퇴').length).toBeGreaterThan(0)
    expect(filterFaq(FAQ_ITEMS, 'order', '탈퇴')).toHaveLength(0)
  })

  it('[AC-SETTINGS-005] 일치하는 항목이 없으면 빈 배열을 반환한다', () => {
    expect(filterFaq(FAQ_ITEMS, 'all', '존재하지않는키워드_zzz')).toHaveLength(0)
  })

  it('[AC-SETTINGS-006] 카테고리 옵션은 전체를 첫 항목으로 가진다', () => {
    expect(FAQ_CATEGORIES[0]?.value).toBe('all')
  })
})

describe('settings.mock — 가이드라인 개정 표기', () => {
  it('[AC-SETTINGS-007] 개정 표기에 SNS/리뷰/채팅 공통 부제를 노출하지 않는다', () => {
    expect(GUIDELINE_REVISION).toBe('최종 개정 2026.04.20')
    expect(GUIDELINE_REVISION).not.toContain('SNS')
  })
})

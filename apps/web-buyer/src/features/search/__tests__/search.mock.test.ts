import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FILTERS,
  FREE_SHIPPING_THRESHOLD,
  activeFilterCount,
  buildSearchResults,
} from '../search.mock'

describe('buildSearchResults', () => {
  it('[AC-SEARCH-001] 검색어에 매칭되는 상품만 반환한다', () => {
    const { products, total } = buildSearchResults('자동 급식기', DEFAULT_FILTERS, 'recommend')
    expect(total).toBeGreaterThan(0)
    expect(products.every(p => `${p.name} ${p.category}`.includes('급식'))).toBe(true)
  })

  it('[AC-SEARCH-002] 매칭 결과가 없으면 total 0 + 대체 검색어를 제공한다(3-C)', () => {
    const result = buildSearchResults('댕댕이 우주복', DEFAULT_FILTERS, 'recommend')
    expect(result.total).toBe(0)
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('[AC-SEARCH-003] 최소 평점 필터가 적용된다', () => {
    const { products } = buildSearchResults('급식기', { ...DEFAULT_FILTERS, minRating: 4.7 }, 'recommend')
    expect(products.every(p => (p.rating ?? 0) >= 4.7)).toBe(true)
  })

  it('[AC-SEARCH-004] 무료배송만 필터는 무료배송 임계값 이상만 남긴다', () => {
    const { products } = buildSearchResults(
      '급식기',
      { ...DEFAULT_FILTERS, freeShippingOnly: true },
      'recommend',
    )
    expect(products.every(p => p.price >= FREE_SHIPPING_THRESHOLD)).toBe(true)
  })

  it('[AC-SEARCH-005] 활성 필터 수는 기본값에서 벗어난 항목만 센다(품절 제외 off도 포함)', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, minRating: 4, freeShippingOnly: true })).toBe(2)
    // 품절 제외(기본 on)를 off로 바꾸면 그것도 적용된 필터로 카운트
    expect(activeFilterCount({ ...DEFAULT_FILTERS, excludeSoldOut: false })).toBe(1)
  })
})

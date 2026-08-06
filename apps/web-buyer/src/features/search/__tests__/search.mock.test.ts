import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, activeFilterCount } from '../search.mock'

describe('activeFilterCount', () => {
  it('[AC-SEARCH-005] 기본값에서 벗어난 필터만 센다(품절 제외 off도 포함)', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, minRating: 4, freeShippingOnly: true })).toBe(2)
    expect(activeFilterCount({ ...DEFAULT_FILTERS, excludeSoldOut: false })).toBe(1)
  })
})

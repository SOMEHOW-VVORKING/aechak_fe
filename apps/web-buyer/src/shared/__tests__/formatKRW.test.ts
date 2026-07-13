import { describe, expect, it } from 'vitest'
import { formatKRW } from '../formatKRW'

describe('formatKRW', () => {
  it('[AC-WB-FORMATKRW-001] 천 단위 구분 + "원"을 붙인다', () => {
    expect(formatKRW(64000)).toBe('64,000원')
  })

  it('[AC-WB-FORMATKRW-002] 1000 미만은 구분자 없이 "원"만 붙인다', () => {
    expect(formatKRW(900)).toBe('900원')
  })

  it('[AC-WB-FORMATKRW-003] 0원도 처리한다', () => {
    expect(formatKRW(0)).toBe('0원')
  })
})

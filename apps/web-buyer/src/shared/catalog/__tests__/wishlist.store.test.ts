import { describe, it, expect, beforeEach } from 'vitest'
import {
  addWish,
  clearWished,
  hydrateWished,
  isWished,
  removeWish,
  resetWishlist,
} from '../wishlist.store'

describe('wishlist.store', () => {
  beforeEach(() => {
    resetWishlist()
  })

  it('[AC-WISH-001] 초기 상태는 비어 있고 hydrateWished로 서버 찜 id를 채운다', () => {
    expect(isWished('p-real-1')).toBe(false)
    hydrateWished(['p-real-1', 'p-real-2'])
    expect(isWished('p-real-1')).toBe(true)
    expect(isWished('p-real-2')).toBe(true)
  })

  it('[AC-WISH-003] removeWish 후 addWish로 실행 취소(복구)가 가능하다', () => {
    addWish('p-real-1')
    removeWish('p-real-1')
    expect(isWished('p-real-1')).toBe(false)
    addWish('p-real-1')
    expect(isWished('p-real-1')).toBe(true)
  })

  it('[AC-WISH-007] hydrateWished는 union 머지라 해제한 id를 되살리지 않는다', () => {
    hydrateWished(['a', 'b'])
    removeWish('a') // 사용자가 해제
    hydrateWished(['b', 'c']) // 다른 페이지 로드 — a는 머지 대상이 아니다
    expect(isWished('a')).toBe(false) // 되살아나지 않음
    expect(isWished('b')).toBe(true)
    expect(isWished('c')).toBe(true)
  })

  it('[AC-WISH-008] clearWished는 로그아웃 시 미러를 비운다', () => {
    hydrateWished(['a', 'b'])
    clearWished()
    expect(isWished('a')).toBe(false)
    expect(isWished('b')).toBe(false)
  })
})

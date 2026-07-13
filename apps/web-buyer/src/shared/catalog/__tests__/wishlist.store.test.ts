import { describe, it, expect, beforeEach } from 'vitest'
import { addWish, isWished, removeWish, resetWishlist, toggleWish } from '../wishlist.store'

describe('wishlist.store', () => {
  beforeEach(() => {
    resetWishlist()
  })

  it('[AC-WISH-001] 시드 상품은 찜된 상태로 시작한다', () => {
    expect(isWished('p-feeder-5l')).toBe(true)
  })

  it('[AC-WISH-002] toggleWish는 찜 상태를 반전시킨다', () => {
    expect(isWished('p-churu')).toBe(false)
    toggleWish('p-churu')
    expect(isWished('p-churu')).toBe(true)
    toggleWish('p-churu')
    expect(isWished('p-churu')).toBe(false)
  })

  it('[AC-WISH-003] removeWish 후 addWish로 실행 취소(복구)가 가능하다', () => {
    removeWish('p-feeder-5l')
    expect(isWished('p-feeder-5l')).toBe(false)
    addWish('p-feeder-5l')
    expect(isWished('p-feeder-5l')).toBe(true)
  })
})

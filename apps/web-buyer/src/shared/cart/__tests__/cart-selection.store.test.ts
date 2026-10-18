import { beforeEach, describe, expect, it } from 'vitest'
import {
  CART_SELECTION_STORAGE_KEY,
  getDeselectedCartItemIds,
  moveCartSelection,
  resetCartSelection,
  setCartItemSelected,
  setCartItemsSelected,
} from '../cart-selection.store'

// 장바구니 해제 집합의 sessionStorage 영속화 — 새로고침·주문서 직접 진입에도 해제가 유지되고, reset이 저장소까지 지운다.
const stored = () => {
  const raw = window.sessionStorage.getItem(CART_SELECTION_STORAGE_KEY)
  return raw == null ? null : (JSON.parse(raw) as number[])
}

describe('cart-selection.store 영속화', () => {
  beforeEach(() => {
    resetCartSelection()
  })

  it('[AC-CART-SELECT-005] 해제·재선택·병합 이동이 sessionStorage에 그대로 적힌다', () => {
    setCartItemSelected(2, false)
    expect(stored()).toEqual([2])

    setCartItemsSelected([3, 4], false)
    expect(stored()?.sort()).toEqual([2, 3, 4])

    moveCartSelection(4, 7)
    expect(stored()?.sort()).toEqual([2, 3, 7])

    setCartItemsSelected([2, 3, 7], true)
    // 전부 선택되면 키 자체를 지운다.
    expect(stored()).toBeNull()
    expect(getDeselectedCartItemIds().size).toBe(0)
  })

  it('[AC-CART-SELECT-006] 저장된 해제 집합은 모듈을 새로 불러도 복원되고, 깨진 값은 빈 집합으로 읽는다', async () => {
    window.sessionStorage.setItem(CART_SELECTION_STORAGE_KEY, JSON.stringify([5, 6, 'x', 1.5]))
    // 새로고침을 흉내 낸다 — 모듈 캐시를 비우고 다시 import하면 저장값으로 초기화돼야 한다.
    const fresh = await freshStore()
    expect([...fresh.getDeselectedCartItemIds()].sort()).toEqual([5, 6])

    window.sessionStorage.setItem(CART_SELECTION_STORAGE_KEY, '{not json')
    const broken = await freshStore()
    expect(broken.getDeselectedCartItemIds().size).toBe(0)

    window.sessionStorage.setItem(CART_SELECTION_STORAGE_KEY, JSON.stringify({ a: 1 }))
    const notArray = await freshStore()
    expect(notArray.getDeselectedCartItemIds().size).toBe(0)
  })

  it('[AC-CART-SELECT-007] resetCartSelection은 메모리 집합과 저장소를 함께 비운다', () => {
    setCartItemsSelected([1, 2], false)
    expect(stored()).not.toBeNull()

    resetCartSelection()
    expect(getDeselectedCartItemIds().size).toBe(0)
    expect(stored()).toBeNull()
  })
})

async function freshStore() {
  const { vi } = await import('vitest')
  vi.resetModules()
  return import('../cart-selection.store')
}

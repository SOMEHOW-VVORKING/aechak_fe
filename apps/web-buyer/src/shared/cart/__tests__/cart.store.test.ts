import { describe, it, expect, beforeEach } from 'vitest'
import { cartLineKey } from '@aechak/domain'
import {
  addToCart,
  getCartItems,
  removeFromCart,
  removeManyFromCart,
  resetCart,
  setAllCartSelected,
  setCartQuantity,
  setCartSelected,
} from '../cart.store'

describe('cart.store', () => {
  beforeEach(() => {
    resetCart()
  })

  it('[AC-CART-STORE-001] 같은 상품+옵션을 다시 담으면 새 라인이 아니라 수량만 합쳐진다', () => {
    const before = getCartItems().length
    addToCart('p-feeder-5l', '용량 5L / 화이트', 2)
    const items = getCartItems()
    expect(items.length).toBe(before)
    const line = items.find(i => cartLineKey(i.productId, i.option) === cartLineKey('p-feeder-5l', '용량 5L / 화이트'))
    expect(line?.quantity).toBe(3) // 시드 1 + 2
  })

  it('[AC-CART-STORE-002] 옵션이 다르면 별개 라인으로 담긴다(새 라인은 기본 선택)', () => {
    addToCart('p-feeder-5l', '용량 8L / 화이트', 1)
    const item = getCartItems().find(i => i.option === '용량 8L / 화이트')
    expect(item).toBeDefined()
    expect(item?.selected).toBe(true)
  })

  it('[AC-CART-STORE-003] 수량은 최소 1로 클램프된다', () => {
    const key = cartLineKey('p-feeder-5l', '용량 5L / 화이트')
    setCartQuantity(key, 0)
    const item = getCartItems().find(i => cartLineKey(i.productId, i.option) === key)
    expect(item?.quantity).toBe(1)
  })

  it('[AC-CART-STORE-004] setAllCartSelected(keys)로 지정한 라인만 선택 해제한다', () => {
    const feederKey = cartLineKey('p-feeder-5l', '용량 5L / 화이트')
    setAllCartSelected(false, [feederKey])
    expect(getCartItems().find(i => cartLineKey(i.productId, i.option) === feederKey)?.selected).toBe(false)
  })

  it('[AC-CART-STORE-005] removeManyFromCart는 넘긴 키의 라인만 제거한다', () => {
    const feederKey = cartLineKey('p-feeder-5l', '용량 5L / 화이트')
    removeManyFromCart([feederKey])
    const items = getCartItems()
    expect(items.some(i => cartLineKey(i.productId, i.option) === feederKey)).toBe(false)
    expect(items.some(i => i.productId === 'p-scratcher')).toBe(true) // 넘기지 않은 라인은 유지
  })

  it('[AC-CART-STORE-006] removeFromCart는 라인을 삭제한다', () => {
    const key = cartLineKey('p-feeder-5l', '용량 5L / 화이트')
    setCartSelected(key, true)
    removeFromCart(key)
    expect(getCartItems().some(i => cartLineKey(i.productId, i.option) === key)).toBe(false)
  })
})

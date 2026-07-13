import { describe, it, expect, beforeEach } from 'vitest'
import { addToCart, cartLineKey, getCartItems, removeManyFromCart, resetCart } from '@/shared/cart'
import { buildCartView } from '@/shared/catalog'

// 결제 성공 후 장바구니 정리 로직의 무결성: 실제 주문된(선택 + 주문 대상) 라인만 제거하고,
// 사용자가 담아둔 품절 라인은 체크돼 있어도 주문 대상이 아니므로 남아야 한다. 품절도 이제
// 체크(selected)는 가능하지만 주문 대상 판정은 selected && orderable이라 orderedKeys에서 빠진다.
describe('결제 성공 후 주문 라인 제거', () => {
  beforeEach(() => {
    resetCart()
  })

  it('[AC-CART-ORDER-001] 주문된(선택+주문가능) 라인만 제거하고 담아둔 품절 라인은 유지한다', () => {
    // 품절 상품을 상세에서 담으면 addToCart가 raw selected:true로 라인을 만든다(체크된 상태).
    addToCart('p-scratcher', '레드', 1)

    const view = buildCartView(getCartItems())
    // 실제 주문된 라인 = 선택 + 주문 대상(품절 아님). 품절은 체크돼 있어도 주문 대상이 아니다.
    const orderedKeys = view.groups
      .flatMap(g => g.lines)
      .filter(l => l.selected && l.orderable)
      .map(l => l.key)

    // 품절 라인은 주문 대상이 아니라 주문 키에 포함되지 않는다.
    expect(orderedKeys).not.toContain(cartLineKey('p-scratcher', '레드'))

    removeManyFromCart(orderedKeys)
    const after = getCartItems()

    // 주문된 급식기는 제거된다.
    expect(after.some(i => i.productId === 'p-feeder-5l')).toBe(false)
    // 담아둔 품절 라인은 그대로 남는다.
    expect(after.some(i => i.productId === 'p-scratcher' && i.option === '레드')).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import type { CartItem } from '@aechak/domain'
import { buildCartView } from '../cart-view'
import { BASE_SHIPPING_FEE } from '../products'

// p-feeder-5l: 냥이상점 64,000원(무료배송 임계 이상)
// p-churu:     냥이상점 13,900원(임계 미만)
// p-joint-90:  코코펫  32,000원(임계 이상)
// p-scratcher: 멍멍마트 29,000원 품절

describe('buildCartView', () => {
  it('[AC-CART-001] 셀러별로 그룹핑하고 선택된 항목만 합계에 넣는다', () => {
    const items: CartItem[] = [
      { productId: 'p-feeder-5l', option: '기본', quantity: 1, selected: true },
      { productId: 'p-joint-90', option: '기본', quantity: 1, selected: true },
    ]
    const view = buildCartView(items)
    expect(view.groups).toHaveLength(2) // 냥이상점 / 코코펫
    expect(view.itemsTotal).toBe(64000 + 32000)
    expect(view.shippingTotal).toBe(0) // 두 그룹 모두 임계 이상 → 무료
    expect(view.grandTotal).toBe(96000)
  })

  it('[AC-CART-002] 품절 라인도 체크할 수 있지만 주문 대상·합계에서는 제외된다', () => {
    const items: CartItem[] = [
      { productId: 'p-feeder-5l', option: '기본', quantity: 1, selected: true },
      { productId: 'p-scratcher', option: '기본', quantity: 1, selected: true }, // 품절도 체크됨
    ]
    const view = buildCartView(items)
    const scratcher = view.groups.flatMap(g => g.lines).find(l => l.productId === 'p-scratcher')
    // 품절 라인도 체크(선택/삭제) 가능하고 체크 상태는 원본대로 반영된다.
    expect(scratcher?.selectable).toBe(true)
    expect(scratcher?.soldOut).toBe(true)
    expect(scratcher?.orderable).toBe(false)
    expect(scratcher?.selected).toBe(true)
    // 전체 선택/선택 삭제 대상엔 품절 포함(2개), 둘 다 체크됐으니 allSelected.
    expect(view.selectableKeys).toHaveLength(2)
    expect(view.selectedLineCount).toBe(2)
    expect(view.allSelected).toBe(true)
    // 하지만 주문 대상·금액·수량엔 품절 제외.
    expect(view.orderableLineCount).toBe(1)
    expect(view.hasSelectedSoldOut).toBe(true)
    expect(view.itemsTotal).toBe(64000) // 품절 제외
    expect(view.selectedQuantity).toBe(1) // 품절 수량 제외
  })

  it('[AC-CART-006] 품절만 선택하면 주문 대상이 0이라 합계·배송비가 0이다', () => {
    const items: CartItem[] = [
      { productId: 'p-scratcher', option: '기본', quantity: 2, selected: true }, // 품절만
    ]
    const view = buildCartView(items)
    expect(view.selectedLineCount).toBe(1) // 체크는 됨(삭제 대상)
    expect(view.orderableLineCount).toBe(0) // 주문 대상은 없음
    expect(view.hasSelectedSoldOut).toBe(true)
    expect(view.itemsTotal).toBe(0)
    expect(view.selectedQuantity).toBe(0)
    expect(view.shippingTotal).toBe(0) // 주문 대상이 없으면 배송비도 0
  })

  it('[AC-CART-003] 셀러 선택 합계가 무료배송 임계 미만이면 기본 배송비가 붙는다', () => {
    const items: CartItem[] = [
      { productId: 'p-churu', option: '기본', quantity: 1, selected: true }, // 13,900 < 30,000
    ]
    const view = buildCartView(items)
    expect(view.shippingTotal).toBe(BASE_SHIPPING_FEE)
    expect(view.grandTotal).toBe(13900 + BASE_SHIPPING_FEE)
    expect(view.groups[0]?.freeShipping).toBe(false)
  })

  it('[AC-CART-004] 선택을 해제하면 itemsTotal/grandTotal이 실시간으로 줄어든다', () => {
    const items: CartItem[] = [
      { productId: 'p-feeder-5l', option: '기본', quantity: 1, selected: true },
      { productId: 'p-joint-90', option: '기본', quantity: 1, selected: false },
    ]
    const view = buildCartView(items)
    expect(view.selectedLineCount).toBe(1)
    expect(view.itemsTotal).toBe(64000)
    expect(view.allSelected).toBe(false)
  })

  it('[AC-CART-005] 수량이 반영된 라인 합계를 계산한다', () => {
    const items: CartItem[] = [
      { productId: 'p-churu', option: '기본', quantity: 3, selected: true }, // 13,900 x 3 = 41,700 ≥ 임계
    ]
    const view = buildCartView(items)
    expect(view.itemsTotal).toBe(41700)
    expect(view.selectedQuantity).toBe(3)
    expect(view.shippingTotal).toBe(0) // 41,700 ≥ 30,000 → 무료
  })
})

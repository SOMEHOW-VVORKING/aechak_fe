import { describe, it, expect, beforeEach } from 'vitest'
import type { CartResponse } from '@aechak/api'
import { buildServerCartView, buildOrderFromCartGroups } from '../cart.queries'
import {
  getDeselectedCartItemIds,
  resetCartSelection,
  setCartItemSelected,
  setCartItemsSelected,
} from '../cart-selection.store'

// 서버 응답 픽스처 — 냥이상점(주문 가능 2라인) + 멍멍마트(품절 1라인).
// 단가는 서버 계약대로 판매가+옵션 추가금 합산값이다. 할인 기간이 아닌 라인은 discountRate가
// null이고 originalPrice(정가+옵션 추가금)가 price와 같다.
function fixture(): CartResponse {
  return {
    sellerGroups: [
      {
        sellerId: 1,
        storeName: '냥이상점',
        baseShippingFee: 3000,
        freeShippingThreshold: 50000,
        items: [
          {
            cartItemId: 1,
            productId: '01J000000000000000000TEST',
            optionCombinationId: 1,
            productName: '자동 급식기',
            thumbnail: null,
            selectedOptions: '기본형',
            quantity: 2,
            originalPrice: 20000,
            price: 20000,
            discountRate: null,
            remainingStock: 10,
            itemStatus: 'ACTIVE',
            isOrderable: true,
          },
          {
            cartItemId: 2,
            productId: '01J000000000000000000TEST',
            optionCombinationId: 2,
            productName: '자동 급식기',
            thumbnail: null,
            selectedOptions: '프리미엄형',
            quantity: 1,
            originalPrice: 25000,
            price: 25000,
            discountRate: null,
            remainingStock: 5,
            itemStatus: 'ACTIVE',
            isOrderable: true,
          },
        ],
      },
      {
        sellerId: 2,
        storeName: '멍멍마트',
        baseShippingFee: 3000,
        freeShippingThreshold: null,
        items: [
          {
            cartItemId: 3,
            productId: '01J000000000000000000SCRA',
            optionCombinationId: 90,
            productName: '스크래쳐 하우스',
            thumbnail: null,
            selectedOptions: '기본',
            quantity: 1,
            originalPrice: 29000,
            price: 29000,
            discountRate: null,
            remainingStock: 0,
            itemStatus: 'OUT_OF_STOCK',
            isOrderable: false,
          },
        ],
      },
    ],
  }
}

describe('buildServerCartView(서버 응답 → 화면 뷰)', () => {
  it('[AC-CART-VIEW-001] 전체 선택 기본값 — 주문 가능 라인만 합계에 들어가고 품절은 빠진다', () => {
    const view = buildServerCartView(fixture(), new Set())
    // 냥이상점 20,000*2 + 25,000*1 = 65,000 ≥ 임계 50,000 → 무료배송.
    expect(view.groups[0]?.selectedSubtotal).toBe(65000)
    expect(view.groups[0]?.freeShipping).toBe(true)
    expect(view.groups[0]?.shippingFee).toBe(0)
    // 품절 라인은 선택돼 있어도 금액·배송비에서 제외(그룹에 주문 대상 선택이 없어 배송비 0).
    expect(view.groups[1]?.selectedSubtotal).toBe(0)
    expect(view.groups[1]?.shippingFee).toBe(0)
    expect(view.itemsTotal).toBe(65000)
    expect(view.grandTotal).toBe(65000)
    expect(view.hasSelectedUnavailable).toBe(true)
    expect(view.orderableLineCount).toBe(2)
    expect(view.selectedQuantity).toBe(3)
  })

  it('[AC-CART-VIEW-002] 임계 미달이면 셀러당 기본 배송비가 붙는다', () => {
    // 1번 라인만 선택(2번·3번 해제) → 40,000 < 50,000 → 배송비 3,000.
    const view = buildServerCartView(fixture(), new Set([2, 3]))
    expect(view.groups[0]?.selectedSubtotal).toBe(40000)
    expect(view.groups[0]?.freeShipping).toBe(false)
    expect(view.groups[0]?.shippingFee).toBe(3000)
    expect(view.grandTotal).toBe(43000)
    expect(view.hasSelectedUnavailable).toBe(false)
  })

  it('[AC-CART-VIEW-003] 무료배송 임계가 null인 셀러는 항상 기본 배송비를 부과한다', () => {
    // 멍멍마트 라인이 품절이 아니라고 가정한 응답으로 확인.
    const res = fixture()
    const scratcher = res.sellerGroups[1]!.items[0]!
    res.sellerGroups[1]!.items[0] = { ...scratcher, itemStatus: 'ACTIVE', isOrderable: true, remainingStock: 3 }
    const view = buildServerCartView(res, new Set())
    expect(view.groups[1]?.freeShipping).toBe(false)
    expect(view.groups[1]?.shippingFee).toBe(3000)
  })

  it('[AC-CART-VIEW-004] 주문 불가 상태별 라벨을 뷰에 채운다', () => {
    const res = fixture()
    const view = buildServerCartView(res, new Set())
    expect(view.groups[1]?.lines[0]?.unavailableLabel).toBe('품절')
    expect(view.groups[0]?.lines[0]?.unavailableLabel).toBeNull()
  })

  it('[AC-CART-VIEW-005] 담긴 수량이 잔여 재고를 초과하면 exceedsStock·hasSelectedExceedsStock이 선다', () => {
    const res = fixture()
    const first = res.sellerGroups[0]!.items[0]!
    // 재고>0인데 담긴 수량이 더 많은 라인(quantity 5 > remainingStock 3) — 서버는 ACTIVE로 준다.
    res.sellerGroups[0]!.items[0] = { ...first, quantity: 5, remainingStock: 3 }
    const view = buildServerCartView(res, new Set())
    expect(view.groups[0]?.lines[0]?.exceedsStock).toBe(true)
    expect(view.groups[0]?.lines[1]?.exceedsStock).toBe(false)
    // 품절(isOrderable=false) 라인은 초과 판정 대상이 아니다.
    expect(view.groups[1]?.lines[0]?.exceedsStock).toBe(false)
    expect(view.hasSelectedExceedsStock).toBe(true)
    // 초과 라인을 선택 해제하면 주문 차단 판정도 꺼진다.
    const deselected = buildServerCartView(res, new Set([1]))
    expect(deselected.hasSelectedExceedsStock).toBe(false)
  })
})

describe('cart-selection.store(해제 집합)', () => {
  beforeEach(() => {
    resetCartSelection()
  })

  it('[AC-CART-SELECT-001] 기본은 전체 선택 — 해제 집합이 비어 있다', () => {
    expect(getDeselectedCartItemIds().size).toBe(0)
  })

  it('[AC-CART-SELECT-002] 라인 해제/재선택이 해제 집합에 반영된다', () => {
    setCartItemSelected(7, false)
    expect(getDeselectedCartItemIds().has(7)).toBe(true)
    setCartItemSelected(7, true)
    expect(getDeselectedCartItemIds().has(7)).toBe(false)
  })

  it('[AC-CART-SELECT-003] 여러 라인을 한 번에 해제/선택한다', () => {
    setCartItemsSelected([1, 2, 3], false)
    expect(getDeselectedCartItemIds().size).toBe(3)
    setCartItemsSelected([1, 2], true)
    expect([...getDeselectedCartItemIds()]).toEqual([3])
  })
})

describe('buildOrderFromCartGroups(결제 성공 → 주문 스냅샷)', () => {
  const meta = {
    orderNo: '20260710-0001',
    method: 'kakaopay' as const,
    orderedAt: '2026.07.10 09:41',
  }

  it('[AC-CART-ORDER-001] 주문된 id의 주문 가능 라인만 스냅샷에 들어가고 품절은 빠진다', () => {
    const groups = buildServerCartView(fixture(), new Set()).groups
    // 품절(3번)까지 id 목록에 섞여 들어와도 주문 스냅샷에서 빠져야 한다.
    const order = buildOrderFromCartGroups({
      ...meta,
      paidAmount: 65000,
      groups,
      orderedCartItemIds: [1, 2, 3],
    })
    expect(order).not.toBeNull()
    expect(order!.groups).toHaveLength(1)
    expect(order!.groups[0]?.items.map(i => i.option)).toEqual(['기본형', '프리미엄형'])
    expect(order!.itemsTotal).toBe(65000)
    expect(order!.shippingTotal).toBe(0)
    expect(order!.pointsUsed).toBe(0)
  })

  it('[AC-CART-ORDER-002] 임계 미달 주문은 배송비가 붙고 적립금 사용액을 역산한다', () => {
    const groups = buildServerCartView(fixture(), new Set()).groups
    // 1번 라인만 주문(40,000) → 배송비 3,000, 실결제 40,000 → 적립금 3,000 사용으로 역산.
    const order = buildOrderFromCartGroups({
      ...meta,
      paidAmount: 40000,
      groups,
      orderedCartItemIds: [1],
    })
    expect(order!.itemsTotal).toBe(40000)
    expect(order!.shippingTotal).toBe(3000)
    expect(order!.pointsUsed).toBe(3000)
  })

  it('[AC-CART-ORDER-003] 유효 라인이 없으면 주문을 만들지 않는다', () => {
    const groups = buildServerCartView(fixture(), new Set()).groups
    const order = buildOrderFromCartGroups({
      ...meta,
      paidAmount: 29000,
      groups,
      orderedCartItemIds: [3], // 품절 라인뿐
    })
    expect(order).toBeNull()
  })
})

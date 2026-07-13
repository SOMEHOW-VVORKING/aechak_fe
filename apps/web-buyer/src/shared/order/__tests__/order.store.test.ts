import { beforeEach, describe, it, expect } from 'vitest'
import type { BuyerOrder } from '@aechak/domain'
import { addOrder, cancelOrder, confirmOrder, getOrders, resetOrders } from '../order.store'

function makeOrder(id: string): BuyerOrder {
  return {
    id,
    orderedAt: '2026.07.10 09:41',
    status: 'paid',
    method: 'kakaopay',
    groups: [
      {
        sellerId: 's1',
        storeName: 'A',
        shippingFee: 0,
        items: [{ productId: 'p1', name: '상품', option: '기본', quantity: 1, unitPrice: 10000 }],
      },
    ],
    itemsTotal: 10000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 10000,
    pointsEarned: 100,
  }
}

describe('order.store', () => {
  beforeEach(() => resetOrders())

  it('[AC-ORDER-STORE-001] 시드 주문에 6개 상태가 모두 존재한다', () => {
    const statuses = new Set(getOrders().map(o => o.status))
    for (const s of ['paid', 'preparing', 'shipping', 'delivered', 'confirmed', 'cancelled']) {
      expect(statuses.has(s as BuyerOrder['status'])).toBe(true)
    }
  })

  it('[AC-ORDER-STORE-002] addOrder는 최신 주문을 앞에 넣고 같은 id는 교체(upsert)한다', () => {
    const before = getOrders().length
    addOrder(makeOrder('20260710-1234'))
    expect(getOrders()[0]?.id).toBe('20260710-1234')
    expect(getOrders()).toHaveLength(before + 1)
    // 같은 id 재추가 → 중복 없이 교체(StrictMode 이중 발화 안전)
    addOrder(makeOrder('20260710-1234'))
    expect(getOrders().filter(o => o.id === '20260710-1234')).toHaveLength(1)
  })

  it('[AC-ORDER-STORE-003] cancelOrder는 상태를 취소완료로 바꾸고 환불일을 찍는다', () => {
    addOrder(makeOrder('o-cancel'))
    cancelOrder('o-cancel')
    const order = getOrders().find(o => o.id === 'o-cancel')
    expect(order?.status).toBe('cancelled')
    expect(order?.refundedAt).toBeTruthy()
  })

  it('[AC-ORDER-STORE-004] confirmOrder는 상태를 구매확정으로 바꾼다', () => {
    addOrder({ ...makeOrder('o-confirm'), status: 'delivered' })
    confirmOrder('o-confirm')
    expect(getOrders().find(o => o.id === 'o-confirm')?.status).toBe('confirmed')
  })
})

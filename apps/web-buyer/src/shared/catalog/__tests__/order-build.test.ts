import { describe, it, expect } from 'vitest'
import type { CartItem } from '@aechak/domain'
import { buildOrderFromContext } from '../order-build'

describe('buildOrderFromContext', () => {
  it('[AC-ORDER-BUILD-001] 주문 라인을 셀러 그룹·금액 스냅샷으로 조립한다', () => {
    const items: CartItem[] = [
      { productId: 'p-feeder-5l', option: '용량 5L / 화이트', quantity: 1, selected: true },
    ]
    const order = buildOrderFromContext({
      orderNo: '20260710-1234',
      method: 'kakaopay',
      paidAmount: 64000,
      orderedAt: '2026.07.10 09:41',
      items,
    })
    expect(order).not.toBeNull()
    expect(order!.id).toBe('20260710-1234')
    expect(order!.status).toBe('paid')
    expect(order!.groups[0]?.items[0]?.name).toContain('고양이 자동 급식기')
    expect(order!.itemsTotal).toBe(64000)
  })

  it('[AC-ORDER-BUILD-002] 사용 적립금은 (상품+배송비) − 결제금액으로 역산된다', () => {
    // 급식기 64,000(무료배송) + 800P 사용 → 결제 63,200 → pointsUsed 800.
    const order = buildOrderFromContext({
      orderNo: '20260710-0001',
      method: 'kakaopay',
      paidAmount: 63200,
      orderedAt: '2026.07.10 09:41',
      items: [{ productId: 'p-feeder-5l', option: '용량 5L / 화이트', quantity: 1, selected: true }],
    })
    expect(order!.pointsUsed).toBe(800)
    expect(order!.paidAmount).toBe(63200)
  })

  it('[AC-ORDER-BUILD-003] 카탈로그에 없는 상품만 있으면 null을 반환한다', () => {
    const order = buildOrderFromContext({
      orderNo: '20260710-9999',
      method: 'card',
      paidAmount: 0,
      orderedAt: '2026.07.10 09:41',
      items: [{ productId: 'does-not-exist', option: '기본', quantity: 1, selected: true }],
    })
    expect(order).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import type { BuyerOrder, BuyerOrderStatus } from '@aechak/domain'
import {
  buildOrderTimeline,
  filterOrdersBySegment,
  isCancelable,
  orderItemCount,
  orderTitle,
  withCatalogThumbnails,
} from '../order.mock'

function makeOrder(status: BuyerOrderStatus, overrides: Partial<BuyerOrder> = {}): BuyerOrder {
  return {
    id: `order-${status}`,
    orderedAt: '2026.07.03 11:30',
    status,
    method: 'kakaopay',
    groups: [
      {
        sellerId: 'seller-a',
        storeName: 'A상점',
        shippingFee: 0,
        items: [{ productId: 'p1', name: '상품 1', option: '기본', quantity: 1, unitPrice: 10000 }],
      },
    ],
    itemsTotal: 10000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 10000,
    pointsEarned: 100,
    ...overrides,
  }
}

describe('order.mock 세그먼트 필터', () => {
  const orders: BuyerOrder[] = [
    makeOrder('paid'),
    makeOrder('shipping'),
    makeOrder('delivered'),
    makeOrder('confirmed'),
    makeOrder('cancelled'),
  ]

  it('[AC-ORDER-001] 전체는 모든 주문을 반환한다', () => {
    expect(filterOrdersBySegment(orders, 'all')).toHaveLength(5)
  })

  it('[AC-ORDER-002] 진행중은 결제완료/상품준비중/배송중만', () => {
    const result = filterOrdersBySegment(orders, 'in-progress').map(o => o.status)
    expect(result).toEqual(['paid', 'shipping'])
  })

  it('[AC-ORDER-003] 완료는 배송완료/구매확정만, 취소/반품은 취소완료만', () => {
    expect(filterOrdersBySegment(orders, 'done').map(o => o.status)).toEqual(['delivered', 'confirmed'])
    expect(filterOrdersBySegment(orders, 'canceled').map(o => o.status)).toEqual(['cancelled'])
  })
})

describe('order.mock 취소 가능 판정', () => {
  it('[AC-ORDER-004] 배송 시작 전(결제완료/상품준비중)만 취소 가능', () => {
    expect(isCancelable('paid')).toBe(true)
    expect(isCancelable('preparing')).toBe(true)
    expect(isCancelable('shipping')).toBe(false)
    expect(isCancelable('delivered')).toBe(false)
    expect(isCancelable('confirmed')).toBe(false)
    expect(isCancelable('cancelled')).toBe(false)
  })
})

describe('order.mock 배송 타임라인', () => {
  it('[AC-ORDER-005] 배송중 주문은 배송중 단계가 active, 이전은 done, 이후는 todo', () => {
    const steps = buildOrderTimeline(makeOrder('shipping'))
    expect(steps.map(s => s.status)).toEqual(['done', 'done', 'active', 'todo', 'todo'])
    expect(steps[2]?.label).toBe('배송중')
  })

  it('[AC-ORDER-006] 배송완료 주문은 구매확정 단계가 todo(자동 확정 예정 안내)', () => {
    const order = makeOrder('delivered', { deliveredAt: '2026.07.05', autoConfirmAt: '2026.07.12' })
    const steps = buildOrderTimeline(order)
    expect(steps.map(s => s.status)).toEqual(['done', 'done', 'done', 'active', 'todo'])
    expect(steps[4]?.sublabel).toContain('자동 구매확정 예정')
  })
})

describe('order.mock 주문 요약', () => {
  it('[AC-ORDER-007] 상품이 여러 개면 "첫 상품 외 N개", 개수도 합산된다', () => {
    const order = makeOrder('paid', {
      groups: [
        {
          sellerId: 'seller-a',
          storeName: 'A상점',
          shippingFee: 0,
          items: [
            { productId: 'p1', name: '리드줄', option: '기본', quantity: 1, unitPrice: 24000 },
            { productId: 'p2', name: '노즈워크', option: '기본', quantity: 1, unitPrice: 18000 },
          ],
        },
      ],
    })
    expect(orderItemCount(order)).toBe(2)
    expect(orderTitle(order)).toBe('리드줄 외 1개')
  })
})

describe('order.mock 카탈로그 썸네일 통일', () => {
  it('[AC-ORDER-008] 스냅샷에 썸네일이 없으면 상품 id로 카탈로그 실루엣을 채운다', () => {
    // 시드/mock 주문 항목(thumbnailUrl 미포함) → 카탈로그의 실루엣 data-URI가 채워진다.
    const order = makeOrder('paid', {
      groups: [
        {
          sellerId: 'seller-냥이상점',
          storeName: '냥이상점',
          shippingFee: 0,
          items: [
            { productId: 'p-feeder-5l', name: '자동 급식기', option: '기본', quantity: 1, unitPrice: 64000 },
          ],
        },
      ],
    })
    const enriched = withCatalogThumbnails(order)
    const thumb = enriched.groups[0]?.items[0]?.thumbnailUrl
    expect(thumb).toBeDefined()
    expect(thumb).toContain('data:image/svg+xml')
  })

  it('[AC-ORDER-009] 이미 썸네일이 있으면 그대로 둔다(멱등)', () => {
    const order = makeOrder('paid', {
      groups: [
        {
          sellerId: 'seller-a',
          storeName: 'A상점',
          shippingFee: 0,
          items: [
            { productId: 'p-feeder-5l', name: '자동 급식기', option: '기본', quantity: 1, unitPrice: 64000, thumbnailUrl: 'data:image/svg+xml,original' },
          ],
        },
      ],
    })
    const enriched = withCatalogThumbnails(order)
    expect(enriched.groups[0]?.items[0]?.thumbnailUrl).toBe('data:image/svg+xml,original')
  })

  it('[AC-ORDER-010] 카탈로그에 없는 상품이면 undefined로 둔다(빈 이미지 fallback)', () => {
    const order = makeOrder('paid', {
      groups: [
        {
          sellerId: 'seller-a',
          storeName: 'A상점',
          shippingFee: 0,
          items: [
            { productId: 'p-unknown-xyz', name: '없는 상품', option: '기본', quantity: 1, unitPrice: 10000 },
          ],
        },
      ],
    })
    const enriched = withCatalogThumbnails(order)
    expect(enriched.groups[0]?.items[0]?.thumbnailUrl).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import type { BuyerOrderStatus, BuyerSellerOrder } from '@aechak/domain'
import {
  ORDER_SEGMENTS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  formatOrderedAt,
  isCancelable,
  sellerOrderTitle,
  shortDate,
} from '../order.mock'

function sellerOrder(overrides: Partial<BuyerSellerOrder> = {}): BuyerSellerOrder {
  return {
    orderId: 'o-1',
    storeName: 'A상점',
    status: 'paid',
    rawStatus: 'PAID',
    itemCount: 1,
    representativeItem: {
      name: '리드줄',
      option: '기본',
      quantity: 1,
      unitPrice: 24000,
      itemStatus: 'ordered',
    },
    ...overrides,
  }
}

describe('order.mock 상태 표시', () => {
  it('[AC-ORDER-001] 표시 상태 6종 모두 라벨과 pill 색이 있다', () => {
    const statuses: BuyerOrderStatus[] = [
      'paid',
      'preparing',
      'shipping',
      'delivered',
      'confirmed',
      'cancelled',
    ]
    for (const s of statuses) {
      expect(ORDER_STATUS_LABEL[s]).toBeTruthy()
      expect(ORDER_STATUS_VARIANT[s]).toBeTruthy()
    }
    expect(ORDER_STATUS_VARIANT.cancelled).toBe('muted')
  })

  it('[AC-ORDER-002] 세그먼트는 전체/진행중/완료/취소 4개다', () => {
    expect(ORDER_SEGMENTS.map(s => s.value)).toEqual(['all', 'in-progress', 'done', 'canceled'])
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

describe('order.mock 주문 일시 포맷', () => {
  it('[AC-ORDER-005] ISO 오프셋 시각을 한국 시간 기준 YYYY.MM.DD HH:mm / MM.DD로 그린다', () => {
    // UTC 23:30 = KST 다음날 08:30 — 머신 TZ와 무관하게 KST 날짜로 떨어져야 한다.
    expect(formatOrderedAt('2026-10-09T23:30:00Z')).toBe('2026.10.10 08:30')
    expect(formatOrderedAt('2026-10-10T10:05:00+09:00')).toBe('2026.10.10 10:05')
    expect(shortDate('2026-10-10T10:05:00+09:00')).toBe('10.10')
  })

  it('[AC-ORDER-006] 파싱할 수 없는 값은 원문을 그대로 돌려준다', () => {
    expect(formatOrderedAt('not-a-date')).toBe('not-a-date')
    expect(shortDate('')).toBe('')
  })
})

describe('order.mock 셀러 주문 제목', () => {
  it('[AC-ORDER-007] 품목이 여러 개면 "대표 상품 외 N개"', () => {
    expect(sellerOrderTitle(sellerOrder({ itemCount: 3 }))).toBe('리드줄 외 2개')
    expect(sellerOrderTitle(sellerOrder({ itemCount: 1 }))).toBe('리드줄')
  })

  it('[AC-ORDER-008] 대표 품목이 없으면 "주문 상품"으로 둔다(전체 품목으로 위장하지 않음)', () => {
    expect(sellerOrderTitle(sellerOrder({ representativeItem: undefined, itemCount: 2 }))).toBe(
      '주문 상품',
    )
  })
})

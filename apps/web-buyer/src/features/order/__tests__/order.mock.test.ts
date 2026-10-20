import { describe, it, expect } from 'vitest'
import type {
  BuyerClaimRefundStatus,
  BuyerClaimStatus,
  BuyerClaimType,
  BuyerOrderDetail,
  BuyerOrderItem,
  BuyerOrderStatus,
  BuyerSellerOrder,
} from '@aechak/domain'
import {
  CLAIM_REFUND_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_VARIANT,
  CLAIM_TYPE_LABEL,
  ORDER_SEGMENTS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  confirmDueRemaining,
  formatOrderedAt,
  isCancelable,
  isConfirmable,
  isReviewable,
  sellerOrderTitle,
  shortDate,
  shortDateTime,
} from '../order.mock'

function orderItem(overrides: Partial<BuyerOrderItem> = {}): BuyerOrderItem {
  return {
    name: '리드줄',
    option: '기본',
    quantity: 1,
    unitPrice: 24000,
    itemStatus: 'ordered',
    productId: 'p-1',
    orderItemId: 11,
    ...overrides,
  }
}

function sellerOrder(overrides: Partial<BuyerSellerOrder> = {}): BuyerSellerOrder {
  return {
    orderId: 'o-1',
    storeName: 'A상점',
    status: 'paid',
    rawStatus: 'PAID',
    itemCount: 1,
    representativeItem: orderItem(),
    ...overrides,
  }
}

function orderDetail(overrides: Partial<BuyerOrderDetail> = {}): BuyerOrderDetail {
  return {
    orderId: 'o-1',
    orderGroupId: 'g-1',
    orderedAt: '2026-10-10T10:00:00+09:00',
    status: 'delivered',
    rawStatus: 'DELIVERED',
    items: [orderItem()],
    sellerShippingFee: 0,
    groupPayment: {
      itemsTotal: 24000,
      shippingTotal: 0,
      couponDiscount: 0,
      pointsUsed: 0,
      paidAmount: 24000,
    },
    deliveryAddress: {
      receiverName: '김집사',
      contactNumber: '01012345678',
      zipCode: '04044',
      baseAddress: '서울 마포구 양화로 00',
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

describe('order.mock 구매확정·리뷰 판정', () => {
  it('[AC-ORDER-009] 배송완료 + 진행 중 클레임 없음만 구매확정 가능(be OrderConfirmService 판정)', () => {
    expect(isConfirmable(orderDetail())).toBe(true)
    expect(
      isConfirmable(
        orderDetail({
          activeClaim: {
            claimPublicId: 'c-1',
            claimType: 'return',
            status: 'requested',
            rawStatus: 'CLAIM_REQUESTED',
          },
        }),
      ),
    ).toBe(false)
    for (const status of ['paid', 'preparing', 'shipping', 'confirmed', 'cancelled'] as const) {
      expect(isConfirmable(orderDetail({ status }))).toBe(false)
    }
  })

  it('[AC-ORDER-010] 리뷰는 구매확정 주문의 정상(ordered) 품목만 — 취소·반품 품목은 제외', () => {
    const confirmed = orderDetail({ status: 'confirmed', rawStatus: 'PURCHASE_CONFIRMED' })
    expect(isReviewable(confirmed, orderItem())).toBe(true)
    for (const itemStatus of [
      'cancelled',
      'return-requested',
      'returned',
      'exchange-requested',
    ] as const) {
      expect(isReviewable(confirmed, orderItem({ itemStatus }))).toBe(false)
    }
    // 배송완료만으로는 리뷰를 쓸 수 없다 — BE가 구매확정 시각을 요구한다(110007).
    expect(isReviewable(orderDetail({ status: 'delivered' }), orderItem())).toBe(false)
  })
})

describe('order.mock 진행 중 클레임 라벨', () => {
  it('[AC-ORDER-011] 클레임 유형 3종·표시 상태 5종 모두 라벨과 pill 색이 있다', () => {
    for (const type of ['cancel', 'return', 'exchange'] as BuyerClaimType[]) {
      expect(CLAIM_TYPE_LABEL[type]).toBeTruthy()
    }
    const statuses: BuyerClaimStatus[] = [
      'requested',
      'collecting',
      'approved',
      'admin-overridden',
      'refund-failed',
    ]
    for (const status of statuses) {
      expect(CLAIM_STATUS_LABEL[status]).toBeTruthy()
      expect(CLAIM_STATUS_VARIANT[status]).toBeTruthy()
    }
  })

  it('[AC-ORDER-012] 환불 없음(none)은 보조 라벨을 두지 않는다', () => {
    expect(CLAIM_REFUND_STATUS_LABEL['none' as BuyerClaimRefundStatus]).toBeUndefined()
    expect(CLAIM_REFUND_STATUS_LABEL.done).toBe('환불 완료')
  })
})

describe('order.mock 주문 일시 포맷', () => {
  it('[AC-ORDER-005] ISO 오프셋 시각을 한국 시간 기준 YYYY.MM.DD HH:mm / MM.DD로 그린다', () => {
    // UTC 23:30 = KST 다음날 08:30 — 머신 TZ와 무관하게 KST 날짜로 떨어져야 한다.
    expect(formatOrderedAt('2026-10-09T23:30:00Z')).toBe('2026.10.10 08:30')
    expect(formatOrderedAt('2026-10-10T10:05:00+09:00')).toBe('2026.10.10 10:05')
    expect(shortDate('2026-10-10T10:05:00+09:00')).toBe('10.10')
    expect(shortDateTime('2026-10-09T23:30:00Z')).toBe('10.10 08:30')
  })

  it('[AC-ORDER-006] 파싱할 수 없는 값은 원문을 그대로 돌려준다', () => {
    expect(formatOrderedAt('not-a-date')).toBe('not-a-date')
    expect(shortDate('')).toBe('')
    expect(shortDateTime('not-a-date')).toBe('not-a-date')
  })

  it('[AC-ORDER-013] 자동확정 남은 시간은 일/시간으로 접고 기한이 지났으면 null', () => {
    const now = Date.parse('2026-10-20T00:00:00Z')
    expect(confirmDueRemaining('2026-10-27T00:00:00Z', now)).toBe('7일 남음')
    expect(confirmDueRemaining('2026-10-20T05:00:00Z', now)).toBe('5시간 남음')
    expect(confirmDueRemaining('2026-10-20T00:30:00Z', now)).toBe('1시간 이내')
    // 기한을 지난 뒤에도 "0일 남음"처럼 거짓을 말하지 않는다.
    expect(confirmDueRemaining('2026-10-19T23:59:00Z', now)).toBeNull()
    expect(confirmDueRemaining('not-a-date', now)).toBeNull()
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

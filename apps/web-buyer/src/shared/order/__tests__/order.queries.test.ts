import { describe, it, expect } from 'vitest'
import type { OrderDetailResponse, OrderGroupItemResponse, OrderStatus } from '@aechak/api'
import {
  isOrderNotFound,
  orderErrorMessage,
  toBuyerOrder,
  toBuyerOrderDetail,
  toBuyerOrderStatus,
} from '../order.queries'

function group(overrides: Partial<OrderGroupItemResponse> = {}): OrderGroupItemResponse {
  return {
    orderGroupId: '01GRP000000000000000000001',
    orderedAt: '2026-10-10T10:00:00+09:00',
    totalProductAmount: 64000,
    totalShippingFee: 3000,
    couponDiscountAmount: 0,
    usedPoint: 1000,
    finalPaymentAmount: 66000,
    sellerOrders: [
      {
        orderId: 'o-1',
        sellerName: '냥이상점',
        status: 'SHIPPING',
        itemCount: 2,
        representativeItem: {
          productName: '츄르',
          thumbnailUrl: null,
          optionName: '참치',
          quantity: 3,
          unitPrice: 13900,
          itemStatus: 'ORDERED',
        },
      },
    ],
    ...overrides,
  }
}

// axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체(inquiry/phone-verification 테스트와 동일).
function axiosError(status: number, errorCode?: number): unknown {
  return {
    isAxiosError: true,
    response: { status, data: errorCode == null ? undefined : { errorCode, message: 'x' } },
  }
}

describe('order.queries 상태 매핑', () => {
  it('[AC-ORDER-MAP-001] 서버 8종을 표시 6종으로 접고 출고 대기는 상품준비중, 결제대기는 null', () => {
    const expected: Record<OrderStatus, string | null> = {
      PENDING_PAYMENT: null,
      PAID: 'paid',
      PREPARING: 'preparing',
      DISPATCH_PENDING: 'preparing',
      SHIPPING: 'shipping',
      DELIVERED: 'delivered',
      PURCHASE_CONFIRMED: 'confirmed',
      CANCELLED: 'cancelled',
    }
    for (const [raw, mapped] of Object.entries(expected)) {
      expect(toBuyerOrderStatus(raw as OrderStatus)).toBe(mapped)
    }
  })

  it('[AC-ORDER-MAP-002] 주문그룹은 셀러 주문별 상태·원문을 보존하고 금액은 그룹 값 그대로 옮긴다', () => {
    const order = toBuyerOrder(group())
    expect(order).not.toBeNull()
    expect(order?.id).toBe('01GRP000000000000000000001')
    expect(order?.paidAmount).toBe(66000)
    expect(order?.pointsUsed).toBe(1000)
    const so = order?.sellerOrders[0]
    expect(so?.status).toBe('shipping')
    expect(so?.rawStatus).toBe('SHIPPING')
    expect(so?.itemCount).toBe(2)
    expect(so?.representativeItem?.name).toBe('츄르')
    expect(so?.representativeItem?.thumbnailUrl).toBeUndefined()
    // 그룹 자체에는 단일 상태가 없다.
    expect(order).not.toHaveProperty('status')
  })

  it('[AC-ORDER-MAP-003] 결제대기 셀러 주문은 건너뛰고, 남는 게 없으면 그룹을 버린다', () => {
    const mixed = toBuyerOrder(
      group({
        sellerOrders: [
          {
            orderId: 'o-pending',
            sellerName: null,
            status: 'PENDING_PAYMENT',
            itemCount: 1,
            representativeItem: null,
          },
          {
            orderId: 'o-paid',
            sellerName: null,
            status: 'PAID',
            itemCount: 1,
            representativeItem: null,
          },
        ],
      }),
    )
    expect(mixed?.sellerOrders.map(so => so.orderId)).toEqual(['o-paid'])
    expect(mixed?.sellerOrders[0]?.storeName).toBeUndefined()
    expect(mixed?.sellerOrders[0]?.representativeItem).toBeUndefined()

    const onlyPending = toBuyerOrder(
      group({
        sellerOrders: [
          {
            orderId: 'o-pending',
            sellerName: null,
            status: 'PENDING_PAYMENT',
            itemCount: 1,
            representativeItem: null,
          },
        ],
      }),
    )
    expect(onlyPending).toBeNull()
  })

  it('[AC-ORDER-MAP-004] 상세는 셀러 배송비와 그룹 결제 요약을 분리하고 품목 상태를 접는다', () => {
    const detail: OrderDetailResponse = {
      orderId: 'o-1',
      orderGroupId: 'g-1',
      orderedAt: '2026-10-10T10:00:00+09:00',
      status: 'DISPATCH_PENDING',
      sellerName: null,
      items: [
        {
          productName: 'A',
          thumbnailUrl: 'https://img/a.png',
          optionName: '기본',
          quantity: 1,
          unitPrice: 10000,
          itemStatus: 'ORDERED',
        },
        {
          productName: 'B',
          thumbnailUrl: null,
          optionName: '기본',
          quantity: 2,
          unitPrice: 5000,
          itemStatus: 'CANCELLED',
        },
      ],
      payment: {
        sellerShippingFee: 3000,
        totalProductAmount: 84000,
        totalShippingFee: 6000,
        couponDiscountAmount: 0,
        usedPoint: 0,
        finalPaymentAmount: 90000,
      },
    }
    const mapped = toBuyerOrderDetail(detail)
    expect(mapped?.status).toBe('preparing')
    expect(mapped?.rawStatus).toBe('DISPATCH_PENDING')
    expect(mapped?.storeName).toBeUndefined()
    expect(mapped?.sellerShippingFee).toBe(3000)
    expect(mapped?.groupPayment).toEqual({
      itemsTotal: 84000,
      shippingTotal: 6000,
      couponDiscount: 0,
      pointsUsed: 0,
      paidAmount: 90000,
    })
    expect(mapped?.items.map(i => i.itemStatus)).toEqual(['ordered', 'cancelled'])
    expect(mapped?.items[0]?.thumbnailUrl).toBe('https://img/a.png')
    expect(mapped?.items[1]?.thumbnailUrl).toBeUndefined()
  })
})

describe('order.queries 에러 판정·문구', () => {
  it('[AC-ORDER-MAP-005] 404(50000)만 "없음"으로 보고 다른 상태는 일반 실패 문구를 준다', () => {
    expect(isOrderNotFound(axiosError(404, 50000))).toBe(true)
    expect(isOrderNotFound(axiosError(404))).toBe(true)
    expect(isOrderNotFound(axiosError(500))).toBe(false)
    expect(isOrderNotFound(new Error('network'))).toBe(false)

    expect(orderErrorMessage(axiosError(404, 50000))).toBe('주문을 찾을 수 없어요')
    expect(orderErrorMessage(axiosError(400, 90002))).toContain('다시 불러와')
    expect(orderErrorMessage(axiosError(500))).toContain('불러오지 못했어요')
    expect(orderErrorMessage(new Error('network'))).toContain('불러오지 못했어요')
  })
})

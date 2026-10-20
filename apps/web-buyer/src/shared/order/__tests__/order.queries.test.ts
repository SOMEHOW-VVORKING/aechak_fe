import { describe, it, expect } from 'vitest'
import type {
  ClaimStatus,
  OrderDetailResponse,
  OrderGroupItemResponse,
  OrderStatus,
} from '@aechak/api'
import {
  confirmPurchaseErrorMessage,
  isAlreadyConfirmed,
  isOrderNotFound,
  orderErrorMessage,
  toBuyerOrder,
  toBuyerOrderDetail,
  toBuyerOrderStatus,
} from '../order.queries'

const ADDRESS = {
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '04044',
  baseAddress: '서울 마포구 양화로 00',
  detailAddress: '101동 1004호',
  deliveryMemo: null,
}

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
          orderItemId: 101,
          productId: 'p-churu',
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

function detailResponse(overrides: Partial<OrderDetailResponse> = {}): OrderDetailResponse {
  return {
    orderId: 'o-1',
    orderGroupId: 'g-1',
    orderedAt: '2026-10-10T10:00:00+09:00',
    status: 'DELIVERED',
    sellerName: '냥이상점',
    items: [
      {
        orderItemId: 11,
        productId: 'p-a',
        productName: 'A',
        thumbnailUrl: null,
        optionName: '기본',
        quantity: 1,
        unitPrice: 10000,
        itemStatus: 'ORDERED',
      },
    ],
    payment: {
      sellerShippingFee: 0,
      totalProductAmount: 10000,
      totalShippingFee: 0,
      couponDiscountAmount: 0,
      usedPoint: 0,
      finalPaymentAmount: 10000,
    },
    deliveryAddress: ADDRESS,
    shipment: null,
    activeClaim: null,
    purchaseConfirmDueAt: null,
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
          orderItemId: 11,
          productId: 'p-a',
          productName: 'A',
          thumbnailUrl: 'https://img/a.png',
          optionName: '기본',
          quantity: 1,
          unitPrice: 10000,
          itemStatus: 'ORDERED',
        },
        {
          orderItemId: 12,
          productId: 'p-b',
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
      deliveryAddress: ADDRESS,
      shipment: null,
      activeClaim: null,
      purchaseConfirmDueAt: null,
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
    // 품목 식별자는 리뷰 작성 대상과 상품 링크의 재료다 — 떨어지면 두 진입점이 함께 죽는다.
    expect(mapped?.items.map(i => i.orderItemId)).toEqual([11, 12])
    expect(mapped?.items.map(i => i.productId)).toEqual(['p-a', 'p-b'])
    // 배송지는 서버가 항상 내려준다. 비어 있는 선택 필드는 undefined로 접는다.
    expect(mapped?.deliveryAddress?.receiverName).toBe('김집사')
    expect(mapped?.deliveryAddress?.detailAddress).toBe('101동 1004호')
    expect(mapped?.deliveryAddress?.deliveryMemo).toBeUndefined()
    // 송장 미등록·클레임 없음·기한 미부여는 null → undefined.
    expect(mapped?.shipment).toBeUndefined()
    expect(mapped?.activeClaim).toBeUndefined()
    expect(mapped?.purchaseConfirmDueAt).toBeUndefined()
  })

  it('[AC-ORDER-MAP-006] 배송·진행 중 클레임·구매확정 기한을 도메인 값으로 옮긴다', () => {
    const mapped = toBuyerOrderDetail(
      detailResponse({
        status: 'DELIVERED',
        shipment: {
          courierCode: 'CJ',
          courierName: 'CJ대한통운',
          trackingNumber: '1234567890',
          dispatchedAt: '2026-10-11T09:00:00+09:00',
          deliveredAt: '2026-10-12T14:00:00+09:00',
          lastTrackingStatus: null,
        },
        activeClaim: {
          claimPublicId: '01CLAIM0000000000000000001',
          claimType: 'RETURN',
          status: 'COLLECTING',
          refundStatus: 'REQUESTED',
        },
        purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
      }),
    )
    expect(mapped?.shipment?.courierName).toBe('CJ대한통운')
    expect(mapped?.shipment?.trackingNumber).toBe('1234567890')
    expect(mapped?.shipment?.deliveredAt).toBe('2026-10-12T14:00:00+09:00')
    // 추적 동기화 경로가 없어 보통 null — 빈 문자열로 위장하지 않는다.
    expect(mapped?.shipment?.lastTrackingStatus).toBeUndefined()
    expect(mapped?.activeClaim).toEqual({
      claimPublicId: '01CLAIM0000000000000000001',
      claimType: 'return',
      status: 'collecting',
      rawStatus: 'COLLECTING',
      refundStatus: 'requested',
    })
    expect(mapped?.purchaseConfirmDueAt).toBe('2026-10-19T14:00:00+09:00')
  })

  it('[AC-ORDER-MAP-007] 거부·철회된 클레임은 진행 중으로 보지 않는다(품목을 풀어준 상태)', () => {
    for (const status of ['REJECTED', 'WITHDRAWN'] as ClaimStatus[]) {
      const mapped = toBuyerOrderDetail(
        detailResponse({
          status: 'DELIVERED',
          activeClaim: {
            claimPublicId: 'c-1',
            claimType: 'CANCEL',
            status,
            refundStatus: null,
          },
        }),
      )
      expect(mapped?.activeClaim).toBeUndefined()
    }
  })
})

describe('order.queries 구매확정 에러 분기', () => {
  // 코드 값은 be domain/.../order/error/OrderErrorCode.kt에서 직접 읽었다.
  it('[AC-ORDER-MAP-008] 구매확정 불가(50007)와 이미 확정(50008)을 다른 문구로 가른다', () => {
    const notConfirmable = confirmPurchaseErrorMessage(axiosError(409, 50007))
    const already = confirmPurchaseErrorMessage(axiosError(409, 50008))
    expect(notConfirmable).toBe('구매확정할 수 없는 상태로 바뀌었어요')
    expect(already).toBe('이미 구매확정된 주문이에요')
    expect(notConfirmable).not.toBe(already)

    expect(confirmPurchaseErrorMessage(axiosError(404, 50000))).toBe('주문을 찾을 수 없어요')
    expect(confirmPurchaseErrorMessage(axiosError(403))).toBe('구매확정할 권한이 없어요')
    expect(confirmPurchaseErrorMessage(axiosError(500))).toContain('구매확정하지 못했어요')
    expect(confirmPurchaseErrorMessage(new Error('network'))).toContain('구매확정하지 못했어요')
  })

  it('[AC-ORDER-MAP-009] 이미 확정(50008)만 "사용자가 원한 결과"로 판정한다', () => {
    expect(isAlreadyConfirmed(axiosError(409, 50008))).toBe(true)
    expect(isAlreadyConfirmed(axiosError(409, 50007))).toBe(false)
    expect(isAlreadyConfirmed(axiosError(500))).toBe(false)
    expect(isAlreadyConfirmed(new Error('network'))).toBe(false)
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

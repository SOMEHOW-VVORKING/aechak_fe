import { describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse } from '@aechak/api'
import {
  currentCart,
  currentCreatedOrderGroups,
  currentOrderGroups,
  makeCartRow,
  makeOrderGroupRow,
  makeSellerOrderRow,
  paymentCallCounts,
  seedCart,
  seedOrderDetail,
  seedOrderGroups,
  seedPaymentState,
} from '../server'

// MSW 핸들러 자체의 계약 검증 — 화면이 아니라 axiosInstance로 직접 때린다. 장바구니·주문·결제 화면 테스트가
// 이 시드와 규칙을 전제로 하므로, 여기서 깨지면 그쪽 실패 원인이 핸들러인지 화면인지 가릴 수 있다.

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const response = errorResponse(error)
    if (!response) throw error
    return { status: response.status, errorCode: response.data?.errorCode }
  }
  throw new Error('요청이 실패해야 하는데 성공했다')
}

const createOrderGroup = (
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'Idempotency-Key': 'key-1' },
) => axiosInstance.post('/order-groups', body, { headers })

// 같은 셀러 두 라인: 64,000 + 69,000 = 133,000 ≥ 임계 50,000 → 배송비 0.
const twoLineCart = () =>
  seedCart([
    makeCartRow({ cartItemId: 1, quantity: 1 }),
    makeCartRow({ cartItemId: 2, optionCombinationId: 2, price: 69000, originalPrice: 94000 }),
  ])

describe('장바구니 핸들러', () => {
  it('[AC-MSW-CART-001] 같은 조합을 다시 담으면 수량이 합산되고 재고를 넘으면 409 50201', async () => {
    const first = await axiosInstance.post('/carts/items', { optionCombinationId: 2, quantity: 2 })
    expect(first.status).toBe(201)
    expect(first.data.data.quantity).toBe(2)
    const second = await axiosInstance.post('/carts/items', { optionCombinationId: 2, quantity: 3 })
    expect(second.data.data.cartItemId).toBe(first.data.data.cartItemId)
    expect(second.data.data.quantity).toBe(5)
    // 조합 2의 재고는 5 — 누적 6은 거절.
    expect(
      await failureOf(axiosInstance.post('/carts/items', { optionCombinationId: 2, quantity: 1 })),
    ).toEqual({ status: 409, errorCode: 50201 })
    expect(currentCart()).toHaveLength(1)
  })

  it('[AC-MSW-CART-002] 옵션 변경이 같은 조합 라인과 합쳐지면 merged=true, 없는 id는 404 50205', async () => {
    twoLineCart()
    const merged = await axiosInstance.patch('/carts/items/1', { optionCombinationId: 2 })
    expect(merged.data.data).toEqual({
      cartItemId: 2,
      quantity: 2,
      optionCombinationId: 2,
      merged: true,
    })
    expect(currentCart().map(r => r.cartItemId)).toEqual([2])
    expect(await failureOf(axiosInstance.patch('/carts/items/1', { quantity: 3 }))).toEqual({
      status: 404,
      errorCode: 50205,
    })
  })

  it('[AC-MSW-CART-003] 삭제는 없는 id를 무시하는 멱등 연산', async () => {
    twoLineCart()
    const first = await axiosInstance.delete('/carts/items', { data: { cartItemIds: [1, 999] } })
    expect(first.data.data.deletedCount).toBe(1)
    const again = await axiosInstance.delete('/carts/items', { data: { cartItemIds: [1] } })
    expect(again.data.data.deletedCount).toBe(0)
    expect(currentCart().map(r => r.cartItemId)).toEqual([2])
  })
})

describe('주문그룹 생성 핸들러', () => {
  it('[AC-MSW-ORDER-001] 서버 계산과 같은 금액이면 201, 같은 멱등키 재요청은 최초 결과를 다시 준다', async () => {
    twoLineCart()
    const body = {
      cartItemIds: [1, 2],
      deliveryAddressId: 7,
      usedPoint: 0,
      expectedFinalAmount: 133000,
    }
    const first = await createOrderGroup(body)
    expect(first.status).toBe(201)
    expect(first.data.data.orderGroupId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(first.data.data).toMatchObject({
      totalProductAmount: 133000,
      totalShippingFee: 0,
      usedPoint: 0,
      finalPaymentAmount: 133000,
    })
    expect(Date.parse(first.data.data.expiresAt)).toBeGreaterThan(Date.now())

    const replay = await createOrderGroup({ ...body, expectedFinalAmount: 1 })
    expect(replay.status).toBe(201)
    expect(replay.data.data.orderGroupId).toBe(first.data.data.orderGroupId)
    expect(currentCreatedOrderGroups()).toHaveLength(1)
    // 주문한 라인은 결제 PAID 전까지 장바구니에 남는다.
    expect(currentCart()).toHaveLength(2)
  })

  it('[AC-MSW-ORDER-002] 멱등키가 없으면 400 90001, 공백이면 400 90004', async () => {
    twoLineCart()
    const body = {
      cartItemIds: [1],
      deliveryAddressId: 7,
      usedPoint: 0,
      expectedFinalAmount: 64000,
    }
    expect(await failureOf(createOrderGroup(body, {}))).toEqual({ status: 400, errorCode: 90001 })
    expect(await failureOf(createOrderGroup(body, { 'Idempotency-Key': '   ' }))).toEqual({
      status: 400,
      errorCode: 90004,
    })
  })

  it('[AC-MSW-ORDER-003] 금액이 어긋나면 409 50106 — 배송비 규칙(선택 라인 합 < 임계 → 기본 배송비)', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1, price: 30000 }),
      makeCartRow({ cartItemId: 2, price: 30000 }),
    ])
    // 하나만 선택하면 30,000 < 50,000이라 배송비 3,000이 붙는다 — 무료배송으로 계산한 금액은 거절.
    expect(
      await failureOf(
        createOrderGroup({
          cartItemIds: [1],
          deliveryAddressId: 7,
          usedPoint: 0,
          expectedFinalAmount: 30000,
        }),
      ),
    ).toEqual({ status: 409, errorCode: 50106 })
    const ok = await createOrderGroup(
      { cartItemIds: [1], deliveryAddressId: 7, usedPoint: 0, expectedFinalAmount: 33000 },
      { 'Idempotency-Key': 'key-2' },
    )
    expect(ok.data.data).toMatchObject({ totalShippingFee: 3000, finalPaymentAmount: 33000 })
  })

  it('[AC-MSW-ORDER-004] 장바구니에 없는 cartItemId는 404 50205', async () => {
    twoLineCart()
    expect(
      await failureOf(
        createOrderGroup({
          cartItemIds: [1, 99],
          deliveryAddressId: 7,
          usedPoint: 0,
          expectedFinalAmount: 0,
        }),
      ),
    ).toEqual({ status: 404, errorCode: 50205 })
  })
})

describe('주문 목록·상세 핸들러', () => {
  it('[AC-MSW-ORDER-005] 커서 페이지네이션 — totalCount는 첫 페이지만, 마지막 페이지는 nextCursor null', async () => {
    seedOrderGroups([
      makeOrderGroupRow({ orderGroupId: 'G3' }),
      makeOrderGroupRow({ orderGroupId: 'G2' }),
      makeOrderGroupRow({ orderGroupId: 'G1' }),
    ])
    const first = await axiosInstance.get('/order-groups', { params: { size: 2 } })
    expect(
      first.data.data.orderGroups.map((g: { orderGroupId: string }) => g.orderGroupId),
    ).toEqual(['G3', 'G2'])
    expect(first.data.data).toMatchObject({ totalCount: 3, hasNext: true })
    expect(first.data.data.nextCursor).toEqual(expect.any(String))

    const second = await axiosInstance.get('/order-groups', {
      params: { size: 2, cursor: first.data.data.nextCursor },
    })
    expect(
      second.data.data.orderGroups.map((g: { orderGroupId: string }) => g.orderGroupId),
    ).toEqual(['G1'])
    expect(second.data.data).toEqual(
      expect.objectContaining({ totalCount: null, nextCursor: null, hasNext: false }),
    )
    expect(
      await failureOf(axiosInstance.get('/order-groups', { params: { cursor: '!!' } })),
    ).toEqual({
      status: 400,
      errorCode: 90002,
    })
  })

  it('[AC-MSW-ORDER-006] status 필터는 하위 주문 하나라도 해당하면 그룹을 통째로 포함한다', async () => {
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: 'MIXED',
        sellerOrders: [
          makeSellerOrderRow({ orderId: 'O-SHIP', status: 'SHIPPING' }),
          makeSellerOrderRow({ orderId: 'O-DONE', status: 'PURCHASE_CONFIRMED' }),
        ],
      }),
      makeOrderGroupRow({
        orderGroupId: 'CANCEL',
        sellerOrders: [makeSellerOrderRow({ orderId: 'O-CXL', status: 'CANCELLED' })],
      }),
    ])
    const completed = await axiosInstance.get('/order-groups', { params: { status: 'completed' } })
    expect(completed.data.data.orderGroups).toHaveLength(1)
    expect(
      completed.data.data.orderGroups[0].sellerOrders.map((s: { status: string }) => s.status),
    ).toEqual(['SHIPPING', 'PURCHASE_CONFIRMED'])
    const cancelled = await axiosInstance.get('/order-groups', { params: { status: 'cancelled' } })
    expect(
      cancelled.data.data.orderGroups.map((g: { orderGroupId: string }) => g.orderGroupId),
    ).toEqual(['CANCEL'])
    expect(
      await failureOf(axiosInstance.get('/order-groups', { params: { status: 'done' } })),
    ).toEqual({
      status: 400,
      errorCode: 90001,
    })
  })

  it('[AC-MSW-ORDER-007] 상세는 그룹 시드에서 파생되고 없으면 404 50000, seedOrderDetail이 우선한다', async () => {
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: 'G1',
        totalShippingFee: 3000,
        finalPaymentAmount: 67000,
        sellerOrders: [
          makeSellerOrderRow({ orderId: 'O1', status: 'SHIPPING', sellerShippingFee: 3000 }),
        ],
      }),
    ])
    const detail = await axiosInstance.get('/orders/O1')
    expect(detail.data.data).toMatchObject({
      orderId: 'O1',
      orderGroupId: 'G1',
      status: 'SHIPPING',
      payment: { sellerShippingFee: 3000, totalShippingFee: 3000, finalPaymentAmount: 67000 },
    })
    expect(await failureOf(axiosInstance.get('/orders/NOPE'))).toEqual({
      status: 404,
      errorCode: 50000,
    })

    seedOrderDetail({ ...detail.data.data, orderId: 'O1', status: 'DELIVERED' })
    expect((await axiosInstance.get('/orders/O1')).data.data.status).toBe('DELIVERED')
  })

  it('[AC-MSW-ORDER-009] 상세는 배송지·송장·진행 중 클레임·구매확정 기한을 신규 필드로 내려준다', async () => {
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: 'G1',
        sellerOrders: [
          makeSellerOrderRow({ orderId: 'O1', status: 'SHIPPING' }),
          makeSellerOrderRow({
            orderId: 'O2',
            status: 'DELIVERED',
            purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
            shipment: {
              courierCode: 'CJ',
              courierName: 'CJ대한통운',
              trackingNumber: '1234567890',
              dispatchedAt: '2026-10-11T09:00:00+09:00',
              deliveredAt: '2026-10-12T14:00:00+09:00',
              lastTrackingStatus: null,
            },
            activeClaim: {
              claimPublicId: 'C1',
              claimType: 'RETURN',
              status: 'COLLECTING',
              refundStatus: 'REQUESTED',
            },
          }),
        ],
      }),
    ])
    // 배송지는 주문그룹 소유라 모든 셀러 주문이 같은 스냅샷을 본다.
    const shipping = (await axiosInstance.get('/orders/O1')).data.data
    expect(shipping.deliveryAddress).toMatchObject({ receiverName: '김집사', zipCode: '04044' })
    // 송장 미등록·클레임 없음·기한 미부여는 null(키 누락이 아니다).
    expect(shipping.shipment).toBeNull()
    expect(shipping.activeClaim).toBeNull()
    expect(shipping.purchaseConfirmDueAt).toBeNull()
    // 품목에는 리뷰 대상 id와 상품 공개 id가 실린다.
    expect(shipping.items[0]).toMatchObject({ orderItemId: expect.any(Number), productId: expect.any(String) })

    const delivered = (await axiosInstance.get('/orders/O2')).data.data
    expect(delivered.shipment).toMatchObject({ courierName: 'CJ대한통운', trackingNumber: '1234567890' })
    expect(delivered.activeClaim).toMatchObject({ claimType: 'RETURN', status: 'COLLECTING' })
    expect(delivered.purchaseConfirmDueAt).toBe('2026-10-19T14:00:00+09:00')
  })

  it('[AC-MSW-ORDER-010] 구매확정은 배송완료+클레임 없음만 204, 그 밖은 50007/50008/50000', async () => {
    seedOrderGroups([
      makeOrderGroupRow({
        orderGroupId: 'G1',
        sellerOrders: [
          makeSellerOrderRow({ orderId: 'SHIPPING', status: 'SHIPPING' }),
          makeSellerOrderRow({ orderId: 'DONE', status: 'PURCHASE_CONFIRMED' }),
          makeSellerOrderRow({
            orderId: 'CLAIMED',
            status: 'DELIVERED',
            activeClaim: {
              claimPublicId: 'C1',
              claimType: 'RETURN',
              status: 'CLAIM_REQUESTED',
              refundStatus: 'NONE',
            },
          }),
          makeSellerOrderRow({
            orderId: 'OK',
            status: 'DELIVERED',
            purchaseConfirmDueAt: '2026-10-19T14:00:00+09:00',
          }),
        ],
      }),
    ])
    expect(await failureOf(axiosInstance.post('/orders/NOPE/confirm'))).toEqual({
      status: 404,
      errorCode: 50000,
    })
    expect(await failureOf(axiosInstance.post('/orders/SHIPPING/confirm'))).toEqual({
      status: 409,
      errorCode: 50007,
    })
    expect(await failureOf(axiosInstance.post('/orders/CLAIMED/confirm'))).toEqual({
      status: 409,
      errorCode: 50007,
    })
    expect(await failureOf(axiosInstance.post('/orders/DONE/confirm'))).toEqual({
      status: 409,
      errorCode: 50008,
    })

    const confirmed = await axiosInstance.post('/orders/OK/confirm')
    expect(confirmed.status).toBe(204)
    // 확정은 비가역 — 재조회가 구매확정을 돌려주고 기한은 사라지며, 두 번째 요청은 50008이다.
    const detail = (await axiosInstance.get('/orders/OK')).data.data
    expect(detail.status).toBe('PURCHASE_CONFIRMED')
    expect(detail.purchaseConfirmDueAt).toBeNull()
    expect(await failureOf(axiosInstance.post('/orders/OK/confirm'))).toEqual({
      status: 409,
      errorCode: 50008,
    })
  })
})

describe('결제 핸들러', () => {
  it('[AC-MSW-PAYMENT-001] 시드 없는 그룹은 404 60008, 시드된 prepare는 201 + 에러 시드 재현', async () => {
    expect(
      await failureOf(
        axiosInstance.post('/order-groups/UNKNOWN/payment/prepare', { method: 'CARD' }),
      ),
    ).toEqual({ status: 404, errorCode: 60008 })
    seedPaymentState({
      OK: { prepare: { targetAmount: 22000 }, finalPaymentAmount: 22000 },
      EXPIRED: { prepare: { error: { status: 409, errorCode: 60009 } } },
    })
    const prepared = await axiosInstance.post('/order-groups/OK/payment/prepare', {
      method: 'KAKAO_PAY',
    })
    expect(prepared.status).toBe(201)
    expect(prepared.data.data).toEqual({
      paymentId: 'OK',
      targetAmount: 22000,
      storeId: 'store-test',
      channelKey: 'channel-key-test',
    })
    const expired = await failureOf(
      axiosInstance.post('/order-groups/EXPIRED/payment/prepare', { method: 'CARD' }),
    )
    expect(expired).toEqual({ status: 409, errorCode: 60009 })
    expect(paymentCallCounts('OK')).toEqual({ prepare: 1, complete: 0 })
  })

  it('[AC-MSW-PAYMENT-002] complete는 시드 순서대로 상태를 주고 마지막 값을 반복한다', async () => {
    seedPaymentState({
      G: {
        completeSequence: [
          'IN_PROGRESS',
          { status: 'FAILED', failureCode: 'PG_DECLINED' },
          { error: { status: 502, errorCode: 60005 } },
          'PAID',
        ],
        finalPaymentAmount: 13000,
      },
    })
    const complete = () => axiosInstance.post('/order-groups/G/payment/complete')
    expect((await complete()).data.data).toMatchObject({ status: 'IN_PROGRESS', failureCode: null })
    expect((await complete()).data.data).toMatchObject({
      status: 'FAILED',
      failureCode: 'PG_DECLINED',
    })
    expect(await failureOf(complete())).toEqual({ status: 502, errorCode: 60005 })
    expect((await complete()).data.data).toMatchObject({
      status: 'PAID',
      finalPaymentAmount: 13000,
    })
    expect((await complete()).data.data.status).toBe('PAID')
    expect(paymentCallCounts('G').complete).toBe(5)
  })

  it('[AC-MSW-PAYMENT-003] 생성한 그룹은 시드 없이도 결제되고, PAID면 주문한 라인만 장바구니에서 빠진다', async () => {
    seedCart([
      makeCartRow({ cartItemId: 1 }),
      makeCartRow({ cartItemId: 2, optionCombinationId: 2, price: 69000 }),
      makeCartRow({
        cartItemId: 3,
        sellerId: 2,
        storeName: '다른상점',
        freeShippingThreshold: null,
      }),
    ])
    const created = await createOrderGroup({
      cartItemIds: [1, 2],
      deliveryAddressId: 7,
      usedPoint: 0,
      expectedFinalAmount: 133000,
    })
    const orderGroupId: string = created.data.data.orderGroupId
    const prepared = await axiosInstance.post(`/order-groups/${orderGroupId}/payment/prepare`, {
      method: 'CARD',
    })
    expect(prepared.data.data).toMatchObject({ paymentId: orderGroupId, targetAmount: 133000 })

    const completed = await axiosInstance.post(`/order-groups/${orderGroupId}/payment/complete`)
    expect(completed.data.data).toMatchObject({
      status: 'PAID',
      orderGroupId,
      finalPaymentAmount: 133000,
    })
    expect(currentCart().map(r => r.cartItemId)).toEqual([3])
    // 확정된 그룹은 주문 목록에 PAID 셀러 주문으로 올라온다.
    const groups = currentOrderGroups()
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ orderGroupId, finalPaymentAmount: 133000 })
    expect(groups[0]?.sellerOrders[0]).toMatchObject({
      status: 'PAID',
      items: [{ quantity: 1 }, { quantity: 1 }],
    })
    const listed = await axiosInstance.get('/order-groups', { params: { status: 'ongoing' } })
    expect(listed.data.data.orderGroups[0].orderGroupId).toBe(orderGroupId)
  })

  it('[AC-MSW-PAYMENT-004] "*" 시드는 생성한 그룹 전체의 기본 결제 응답을 바꾼다', async () => {
    seedCart([makeCartRow({ cartItemId: 1 })])
    seedPaymentState({ '*': { completeSequence: ['NOT_STARTED'] } })
    const created = await createOrderGroup({
      cartItemIds: [1],
      deliveryAddressId: 7,
      usedPoint: 0,
      expectedFinalAmount: 64000,
    })
    const completed = await axiosInstance.post(
      `/order-groups/${created.data.data.orderGroupId}/payment/complete`,
    )
    expect(completed.data.data.status).toBe('NOT_STARTED')
    expect(currentCart()).toHaveLength(1)
  })
})

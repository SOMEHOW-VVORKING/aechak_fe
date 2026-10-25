import { describe, it, expect } from 'vitest'
import type {
  ClaimItemResponse,
  ClaimReasonCatalogResponse,
  OrderGroupDetailResponse,
} from '@aechak/api'
import type { BuyerOrderClaim, BuyerOrderDetail } from '@aechak/domain'
import {
  canRequestClaim,
  claimReasonsErrorMessage,
  isClaimAlreadyInProgress,
  isWithdrawable,
  needsReasonDetail,
  requestClaimErrorMessage,
  toBuyerClaimReasonCatalog,
  toBuyerClaimRecord,
  toKstInstant,
  withdrawClaimErrorMessage,
} from '../claim.queries'
import { holdsOrderItem, toBuyerOrderGroupDetail } from '../order.queries'

// axios 오류 모양만 흉내 — errorResponse(error)가 보는 것은 `error.response`다.
const axiosError = (status: number, errorCode?: number) => ({
  isAxiosError: true,
  response: { status, data: errorCode == null ? {} : { errorCode, message: 'x' } },
})

function claimResponse(overrides: Partial<ClaimItemResponse> = {}): ClaimItemResponse {
  return {
    claimPublicId: 'CLAIM1',
    claimType: 'RETURN',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REQUESTED',
    returnCostBearer: null,
    refundAmount: 27000,
    rejectionReason: null,
    requestedAt: '2026-10-20T10:00:00',
    approvedAt: null,
    resolvedAt: null,
    items: [{ orderItemId: 11, productName: '리드줄', quantity: 1, refundAmount: 24000 }],
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
    items: [
      {
        name: '리드줄',
        option: '기본',
        quantity: 1,
        unitPrice: 24000,
        itemStatus: 'ordered',
        productId: 'p-1',
        orderItemId: 11,
      },
    ],
    sellerShippingFee: 3000,
    groupPayment: {
      itemsTotal: 24000,
      shippingTotal: 3000,
      couponDiscount: 0,
      pointsUsed: 0,
      paidAmount: 27000,
    },
    ...overrides,
  }
}

describe('claim.queries 시각 정규화', () => {
  it('[AC-CLAIM-ADAPT-001] 오프셋 없는 LocalDateTime은 KST로 읽는다(머신 TZ에 흔들리지 않는다)', () => {
    // BE 클레임 응답은 LocalDateTime 직렬화라 오프셋이 없다 — 그대로 Date에 넣으면 UTC 머신(CI)에서
    // 9시간 어긋난다. 어댑터가 오프셋을 붙여 넘겨야 표시 계층이 절대 시각만 다룬다.
    expect(toKstInstant('2026-10-20T10:00:00')).toBe('2026-10-20T10:00:00+09:00')
    expect(Date.parse('2026-10-20T10:00:00+09:00')).toBe(Date.parse('2026-10-20T01:00:00Z'))
  })

  it('[AC-CLAIM-ADAPT-002] 이미 오프셋이 있으면 그대로 두고, 빈 값은 undefined로 접는다', () => {
    expect(toKstInstant('2026-10-20T01:00:00Z')).toBe('2026-10-20T01:00:00Z')
    expect(toKstInstant('2026-10-20T10:00:00+09:00')).toBe('2026-10-20T10:00:00+09:00')
    expect(toKstInstant('2026-10-20T10:00:00-05:00')).toBe('2026-10-20T10:00:00-05:00')
    expect(toKstInstant(null)).toBeUndefined()
    expect(toKstInstant(undefined)).toBeUndefined()
    expect(toKstInstant('')).toBeUndefined()
  })
})

describe('claim.queries 내역 매핑', () => {
  it('[AC-CLAIM-ADAPT-003] 서버 enum 4종을 도메인 값으로 접고 시각에 오프셋을 붙인다', () => {
    const claim = toBuyerClaimRecord(
      claimResponse({
        status: 'COLLECTING',
        refundStatus: 'REQUESTED',
        sellerApprovalStatus: 'APPROVED',
        returnCostBearer: 'SELLER',
        approvedAt: '2026-10-21T09:00:00',
      }),
    )
    expect(claim).toMatchObject({
      claimPublicId: 'CLAIM1',
      claimType: 'return',
      status: 'collecting',
      rawStatus: 'COLLECTING',
      refundStatus: 'requested',
      sellerApproval: 'approved',
      returnCostBearer: 'seller',
      refundAmount: 27000,
      requestedAt: '2026-10-20T10:00:00+09:00',
      approvedAt: '2026-10-21T09:00:00+09:00',
    })
    expect(claim.resolvedAt).toBeUndefined()
  })

  it('[AC-CLAIM-ADAPT-004] 내역은 거부·철회도 그대로 넘긴다(상세 activeClaim과 달리 접지 않는다)', () => {
    expect(toBuyerClaimRecord(claimResponse({ status: 'REJECTED' })).status).toBe('rejected')
    expect(toBuyerClaimRecord(claimResponse({ status: 'WITHDRAWN' })).status).toBe('withdrawn')
    // 그 둘만 품목을 풀어준다(be ClaimStatus.RELEASED).
    expect(holdsOrderItem('rejected')).toBe(false)
    expect(holdsOrderItem('withdrawn')).toBe(false)
    for (const status of ['requested', 'collecting', 'approved', 'admin-overridden', 'refund-failed'] as const) {
      expect(holdsOrderItem(status)).toBe(true)
    }
  })

  it('[AC-CLAIM-ADAPT-005] 서버가 상품명을 빈 문자열로 주면 undefined로 접는다(빈 이름을 그리지 않게)', () => {
    const claim = toBuyerClaimRecord(
      claimResponse({ items: [{ orderItemId: 11, productName: '', quantity: 1, refundAmount: 0 }] }),
    )
    expect(claim.items?.[0]?.productName).toBeUndefined()
  })
})

describe('claim.queries 사유 선택지 매핑', () => {
  const catalog: ClaimReasonCatalogResponse = {
    claimTypes: [
      {
        claimType: 'CANCEL',
        reasons: [
          { code: 'CHANGE_OF_MIND', label: '단순 변심', detailRequired: false },
          { code: 'OTHER', label: '기타', detailRequired: true },
        ],
      },
      {
        claimType: 'RETURN',
        reasons: [{ code: 'DEFECTIVE', label: '상품이 파손되었거나 불량이에요', detailRequired: false }],
      },
    ],
  }

  it('[AC-CLAIM-ADAPT-006] 유형별 선택지를 순서까지 보존하고 문구를 서버 값으로 쓴다', () => {
    const mapped = toBuyerClaimReasonCatalog(catalog)
    expect(mapped.cancel.map(r => r.code)).toEqual(['CHANGE_OF_MIND', 'OTHER'])
    expect(mapped.cancel[0]?.label).toBe('단순 변심')
    expect(mapped.return[0]?.label).toBe('상품이 파손되었거나 불량이에요')
  })

  it('[AC-CLAIM-ADAPT-007] 서버가 주지 않은 유형은 빈 배열로 남긴다(선택지를 지어내지 않는다)', () => {
    expect(toBuyerClaimReasonCatalog(catalog).exchange).toEqual([])
  })

  it('[AC-CLAIM-ADAPT-008] 상세 필수는 선택지가 정한다(코드 이름으로 추측하지 않는다)', () => {
    const options = toBuyerClaimReasonCatalog(catalog).cancel
    expect(needsReasonDetail(options, 'OTHER')).toBe(true)
    expect(needsReasonDetail(options, 'CHANGE_OF_MIND')).toBe(false)
    // 목록에 없는 코드는 요구하지 않는 것으로 본다(서버가 400 50412로 먼저 거절한다).
    expect(needsReasonDetail(options, 'UNKNOWN')).toBe(false)
  })
})

describe('claim.queries 요청 가능 판정', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-10-20T00:00:00Z')

  it('[AC-CLAIM-ADAPT-009] 취소는 발송 전만, 반품·교환은 배송완료만(be ClaimType.requestableFrom)', () => {
    for (const status of ['paid', 'preparing'] as const) {
      expect(canRequestClaim(orderDetail({ status }), 'cancel', now)).toBe(true)
    }
    for (const status of ['shipping', 'delivered', 'confirmed', 'cancelled'] as const) {
      expect(canRequestClaim(orderDetail({ status }), 'cancel', now)).toBe(false)
    }
    for (const type of ['return', 'exchange'] as const) {
      expect(canRequestClaim(orderDetail({ status: 'delivered' }), type, now)).toBe(true)
      for (const status of ['paid', 'preparing', 'shipping', 'confirmed', 'cancelled'] as const) {
        expect(canRequestClaim(orderDetail({ status }), type, now)).toBe(false)
      }
    }
  })

  it('[AC-CLAIM-ADAPT-010] 구매확정하면 반품·교환도 못 한다(확정이 기한을 여는 것이 아니다)', () => {
    const confirmed = orderDetail({ status: 'confirmed', rawStatus: 'PURCHASE_CONFIRMED' })
    expect(canRequestClaim(confirmed, 'return', now)).toBe(false)
    expect(canRequestClaim(confirmed, 'exchange', now)).toBe(false)
  })

  it('[AC-CLAIM-ADAPT-011] 반품 기한은 배송완료 +7일이고 지나면 닫는다', () => {
    const shipment = (deliveredAt: string) => ({
      courierCode: 'CJ',
      courierName: 'CJ대한통운',
      trackingNumber: '1',
      deliveredAt,
    })
    const within = new Date(now - 6 * DAY_MS).toISOString()
    const expired = new Date(now - 8 * DAY_MS).toISOString()
    expect(canRequestClaim(orderDetail({ shipment: shipment(within) }), 'return', now)).toBe(true)
    expect(canRequestClaim(orderDetail({ shipment: shipment(expired) }), 'return', now)).toBe(false)
  })

  it('[AC-CLAIM-ADAPT-012] 배송완료 시각을 모르면 열어 두고 서버 판정에 맡긴다', () => {
    // 서버는 주문 상태 이력의 DELIVERED 전이 시각으로 기한을 재고 화면은 송장의 배송완료 시각만 안다 —
    // 출처가 다르므로 모를 때 닫아 버리면 멀쩡한 요청을 화면이 막는다.
    expect(canRequestClaim(orderDetail({ shipment: undefined }), 'return', now)).toBe(true)
    expect(
      canRequestClaim(
        orderDetail({
          shipment: { courierCode: 'CJ', courierName: 'CJ대한통운', trackingNumber: '1' },
        }),
        'return',
        now,
      ),
    ).toBe(true)
  })

  it('[AC-CLAIM-ADAPT-013] 진행 중 클레임이 있으면 유형과 무관하게 받지 않는다(서버 409 50403)', () => {
    const held = orderDetail({
      activeClaim: {
        claimPublicId: 'c-1',
        claimType: 'return',
        status: 'requested',
        rawStatus: 'CLAIM_REQUESTED',
      },
    })
    for (const type of ['cancel', 'return', 'exchange'] as const) {
      expect(canRequestClaim(held, type, now)).toBe(false)
    }
  })

  it('[AC-CLAIM-ADAPT-014] 철회는 셀러 판단 전(CLAIM_REQUESTED)만 — 회수 중에는 서버가 409 50402', () => {
    const claim = (status: BuyerOrderClaim['status']): BuyerOrderClaim => ({
      claimPublicId: 'c-1',
      claimType: 'return',
      status,
      rawStatus: status,
    })
    expect(isWithdrawable(claim('requested'))).toBe(true)
    for (const status of ['collecting', 'approved', 'admin-overridden', 'refund-failed', 'rejected', 'withdrawn'] as const) {
      expect(isWithdrawable(claim(status))).toBe(false)
    }
  })
})

describe('claim.queries 에러 문구', () => {
  it('[AC-CLAIM-ADAPT-015] 요청 거절 분기를 errorCode로 가른다', () => {
    expect(requestClaimErrorMessage(axiosError(409, 50401))).toBe('지금은 요청할 수 없는 상태로 바뀌었어요')
    expect(requestClaimErrorMessage(axiosError(409, 50403))).toBe('이미 진행 중인 요청이 있어요')
    expect(requestClaimErrorMessage(axiosError(422, 50406))).toBe('주문한 수량 전부만 요청할 수 있어요')
    expect(requestClaimErrorMessage(axiosError(422, 50410))).toBe('주문한 수량 전부만 요청할 수 있어요')
    expect(requestClaimErrorMessage(axiosError(400, 50412))).toBe('선택할 수 없는 사유예요. 사유를 다시 골라 주세요')
    expect(requestClaimErrorMessage(axiosError(400, 50413))).toBe('상세 사유를 입력해 주세요')
    expect(requestClaimErrorMessage(axiosError(404, 50000))).toBe('주문을 찾을 수 없어요')
    // 모르는 코드는 status로 떨어진다.
    expect(requestClaimErrorMessage(axiosError(400))).toBe('요청 정보가 올바르지 않아요. 다시 시도해 주세요')
    expect(requestClaimErrorMessage(axiosError(500))).toBe('요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요')
    expect(isClaimAlreadyInProgress(axiosError(409, 50403))).toBe(true)
    expect(isClaimAlreadyInProgress(axiosError(409, 50401))).toBe(false)
  })

  it('[AC-CLAIM-ADAPT-016] 철회 거절은 상태 전이(50402)와 없음(50400)을 구분한다', () => {
    expect(withdrawClaimErrorMessage(axiosError(409, 50402))).toBe('판매자가 이미 확인해서 철회할 수 없어요')
    expect(withdrawClaimErrorMessage(axiosError(404, 50400))).toBe('요청 내역을 찾을 수 없어요')
    expect(withdrawClaimErrorMessage(axiosError(404, 50000))).toBe('주문을 찾을 수 없어요')
    expect(withdrawClaimErrorMessage(axiosError(500))).toBe('철회하지 못했어요. 잠시 후 다시 시도해 주세요')
  })

  it('[AC-CLAIM-ADAPT-017] 사유 경로 404는 "아직 준비 안 됨"으로 적는다(SCRUM-273 미머지)', () => {
    expect(claimReasonsErrorMessage(axiosError(404))).toBe('아직 요청 사유를 받을 준비가 안 됐어요')
    expect(claimReasonsErrorMessage(axiosError(500))).toBe('요청 사유를 불러오지 못했어요')
  })
})

describe('order.queries 주문그룹 매핑', () => {
  const groupDetail = (
    orders: OrderGroupDetailResponse['orders'],
  ): OrderGroupDetailResponse => ({
    orderGroupId: 'g-1',
    status: 'PAID',
    totalProductAmount: 24000,
    totalShippingFee: 0,
    usedPoint: 0,
    finalPaymentAmount: 24000,
    expiresAt: '2026-10-10T10:10:00+09:00',
    deliveryAddress: {
      receiverName: '김집사',
      contactNumber: '01012345678',
      zipCode: '04044',
      baseAddress: '서울 마포구 양화로 00',
      detailAddress: null,
      deliveryMemo: null,
    },
    orders,
  })

  const line = {
    orderItemId: 11,
    productId: 'p-1',
    productName: '리드줄',
    thumbnailUrl: null,
    optionName: '기본',
    quantity: 1,
    unitPrice: 24000,
    itemStatus: 'ORDERED' as const,
  }

  it('[AC-CLAIM-ADAPT-018] 품목 수와 대표 품목은 전체 품목에서 뽑는다(목록 응답과 모양을 맞춘다)', () => {
    const mapped = toBuyerOrderGroupDetail(
      groupDetail([
        {
          orderId: 'o-1',
          status: 'SHIPPING',
          sellerName: '냥이상점',
          sellerShippingFee: 3000,
          items: [line, { ...line, orderItemId: 12, productName: '하네스' }],
        },
      ]),
    )
    expect(mapped.orderGroupId).toBe('g-1')
    expect(mapped.sellerOrders).toHaveLength(1)
    expect(mapped.sellerOrders[0]).toMatchObject({
      orderId: 'o-1',
      storeName: '냥이상점',
      status: 'shipping',
      rawStatus: 'SHIPPING',
      itemCount: 2,
    })
    expect(mapped.sellerOrders[0]?.representativeItem?.name).toBe('리드줄')
  })

  it('[AC-CLAIM-ADAPT-019] 결제대기 주문은 표시 상태가 없어 걸러낸다(목록 응답과 같은 규칙)', () => {
    const mapped = toBuyerOrderGroupDetail(
      groupDetail([
        { orderId: 'o-pending', status: 'PENDING_PAYMENT', sellerName: null, sellerShippingFee: 0, items: [line] },
        { orderId: 'o-paid', status: 'PAID', sellerName: null, sellerShippingFee: 0, items: [line] },
      ]),
    )
    expect(mapped.sellerOrders.map(so => so.orderId)).toEqual(['o-paid'])
    // 셀러명이 없으면(탈퇴 등) 가짜 이름을 채우지 않는다.
    expect(mapped.sellerOrders[0]?.storeName).toBeUndefined()
  })
})

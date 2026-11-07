import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `/admin/claims` 넷(목록·사유 카탈로그·상세·개입)의 서버 흉내. BE
// `boot/admin/.../claim/AdminClaimController` + `domain/.../order/claim/Claim.kt`의 계약을 옮긴다.
//
// 고정해야 하는 것이 둘이다. ① `interventionAllowed`는 상태·환불 축·교환 종결 셋을 함께 보고
// 정해지므로(ClaimStatus.ADMIN_OVERRIDABLE + RefundStatus) 화면이 그 값을 믿어야 하고,
// ② 개입 기록 1행이 멱등 게이트라 **두 번째 개입은 409**다 — 같은 버튼을 두 번 눌러 두 요청이
// 나가면 서버가 한쪽을 거절한다는 사실이 테스트에 남아야 한다.

export const ADMIN_CLAIMS_URL = `${adminBase}/admin/claims`
export const ADMIN_CLAIM_REASONS_URL = `${ADMIN_CLAIMS_URL}/intervention-reasons`
export const ADMIN_CLAIM_DETAIL_URL = `${ADMIN_CLAIMS_URL}/:claimPublicId`
export const ADMIN_CLAIM_INTERVENE_URL = `${ADMIN_CLAIM_DETAIL_URL}/intervention`

export type WireClaimType = 'CANCEL' | 'RETURN' | 'EXCHANGE'
export type WireClaimStatus =
  | 'CLAIM_REQUESTED'
  | 'COLLECTING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADMIN_OVERRIDDEN'
  | 'REFUND_FAILED'
  | 'WITHDRAWN'
export type WireRefundStatus = 'NONE' | 'REQUESTED' | 'DONE' | 'REFUND_FAILED'
export type WireSellerApproval = 'REQUESTED' | 'APPROVED' | 'REJECTED'
export type WireFaultDecision = 'SELLER_FAULT' | 'BUYER_FAULT' | 'CLAIM_DISMISSED'
export type WireCostBearer = 'BUYER' | 'SELLER'
export type WireInterventionReason =
  | 'SELLER_UNRESPONSIVE'
  | 'SELLER_DECISION_UNFAIR'
  | 'EVIDENCE_SUPPORTS_BUYER'
  | 'EVIDENCE_SUPPORTS_SELLER'
  | 'BUYER_CHANGE_OF_MIND'
  | 'BUYER_ABUSE'
  | 'POLICY_VIOLATION'
  | 'OTHER'

/** 운영자가 개입할 수 있는 상태 — BE ClaimStatus.ADMIN_OVERRIDABLE과 같은 집합이다. */
const ADMIN_OVERRIDABLE: WireClaimStatus[] = [
  'CLAIM_REQUESTED',
  'COLLECTING',
  'APPROVED',
  'REJECTED',
  'REFUND_FAILED',
]

/** 판정별 claimAccepted와 기본 부담 주체 — BE ClaimFaultDecision. */
const FAULT_DECISIONS: Record<
  WireFaultDecision,
  { claimAccepted: boolean; defaultCostBearer: WireCostBearer | null }
> = {
  SELLER_FAULT: { claimAccepted: true, defaultCostBearer: 'SELLER' },
  BUYER_FAULT: { claimAccepted: true, defaultCostBearer: 'BUYER' },
  CLAIM_DISMISSED: { claimAccepted: false, defaultCostBearer: null },
}

/** 판정별로 고를 수 있는 사유와 문구 — BE ClaimInterventionReason.selectableFor + label. */
const REASON_CATALOG: Record<
  WireFaultDecision,
  { code: WireInterventionReason; label: string; detailRequired: boolean }[]
> = {
  SELLER_FAULT: [
    { code: 'SELLER_UNRESPONSIVE', label: '셀러가 기한 내 응답하지 않았어요', detailRequired: false },
    {
      code: 'SELLER_DECISION_UNFAIR',
      label: '셀러 처리가 운영 정책에 맞지 않아요',
      detailRequired: false,
    },
    { code: 'EVIDENCE_SUPPORTS_BUYER', label: '구매자 주장에 근거가 있어요', detailRequired: false },
    { code: 'OTHER', label: '기타', detailRequired: true },
  ],
  BUYER_FAULT: [
    { code: 'EVIDENCE_SUPPORTS_SELLER', label: '셀러 주장에 근거가 있어요', detailRequired: false },
    {
      code: 'BUYER_CHANGE_OF_MIND',
      label: '구매자 단순 변심으로 확인됐어요',
      detailRequired: false,
    },
    { code: 'OTHER', label: '기타', detailRequired: true },
  ],
  CLAIM_DISMISSED: [
    { code: 'EVIDENCE_SUPPORTS_SELLER', label: '셀러 주장에 근거가 있어요', detailRequired: false },
    { code: 'BUYER_ABUSE', label: '구매자의 반복·악성 요청이에요', detailRequired: false },
    { code: 'POLICY_VIOLATION', label: '운영 정책 위반이 확인됐어요', detailRequired: false },
    { code: 'OTHER', label: '기타', detailRequired: true },
  ],
}

const REASON_DETAIL_MAX = 500
const MEMO_MAX = 300
const ACTING_ADMIN_ID = 1

export interface AdminClaimWire {
  claimPublicId: string
  orderPublicId: string
  claimType: WireClaimType
  reasonCode: string | null
  reasonLabel: string | null
  reasonDetail: string | null
  status: WireClaimStatus
  refundStatus: WireRefundStatus | null
  sellerApprovalStatus: WireSellerApproval | null
  settlementStatus: 'PENDING' | 'SETTLED' | null
  returnCostBearer: WireCostBearer | null
  refundAmount: number
  returnShippingFee: number | null
  productNames: string[]
  itemCount: number
  sellerId: number
  sellerName: string | null
  buyerPublicId: string | null
  buyerNickname: string | null
  requestedAt: string | null
  autoApproveDueAt: string | null
  approvedAt: string | null
  resolvedAt: string | null
  collectionStartedAt: string | null
  disputeElapsedDays: number | null
  rejectionReason: string | null
  sellerMemo: string | null
  order: {
    orderStatus: string
    orderedAt: string
    sellerShippingFee: number
    recipientName: string
    contactNumber: string
    zipCode: string
    baseAddress: string
    detailAddress: string | null
    deliveryMemo: string | null
  }
  items: {
    orderItemId: number
    productName: string
    optionName: string
    quantity: number
    unitPrice: number
    refundAmount: number
    itemStatus: string
  }[]
  intervention: {
    adminId: number
    faultDecision: WireFaultDecision
    claimAccepted: boolean
    reason: WireInterventionReason
    reasonLabel: string
    reasonDetail: string | null
    returnCostBearer: WireCostBearer | null
    previousStatus: WireClaimStatus
    previousSellerApprovalStatus: WireSellerApproval | null
    previousResolvedAt: string | null
    internalMemo: string | null
    intervenedAt: string
  } | null
}

let claims: AdminClaimWire[] = []

export function makeAdminClaimWire(overrides: Partial<AdminClaimWire> = {}): AdminClaimWire {
  return {
    claimPublicId: '01HZXC0000000000000000001',
    orderPublicId: '01HZXO0000000000000000001',
    claimType: 'RETURN',
    reasonCode: 'DEFECTIVE',
    reasonLabel: '파손/불량',
    reasonDetail: '박스를 열자마자 기둥이 갈라져 있었어요.',
    status: 'REJECTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REJECTED',
    settlementStatus: 'PENDING',
    returnCostBearer: null,
    refundAmount: 139_000,
    returnShippingFee: 8_000,
    productNames: ['원목 캣타워 대형'],
    itemCount: 1,
    sellerId: 7,
    sellerName: '냥이상점',
    buyerPublicId: '01HZXU0000000000000000001',
    buyerNickname: '보리네집',
    requestedAt: '2026-10-25T20:10:00',
    autoApproveDueAt: '2026-10-28T20:10:00',
    approvedAt: null,
    resolvedAt: '2026-10-26T10:00:00',
    collectionStartedAt: null,
    disputeElapsedDays: 4,
    rejectionReason: '출고 전 검수 사진에는 파손이 없었어요.',
    sellerMemo: '택배사 과실로 보여요.',
    order: {
      orderStatus: 'DELIVERED',
      orderedAt: '2026-10-20T11:00:00',
      sellerShippingFee: 3_000,
      recipientName: '김보리',
      contactNumber: '010-1234-5678',
      zipCode: '06236',
      baseAddress: '서울 강남구 테헤란로 123',
      detailAddress: '4층',
      deliveryMemo: '문 앞에 놔주세요',
    },
    items: [
      {
        orderItemId: 9001,
        productName: '원목 캣타워 대형',
        optionName: '대형 / 베이지',
        quantity: 1,
        unitPrice: 139_000,
        refundAmount: 139_000,
        itemStatus: 'RETURN_REQUESTED',
      },
    ],
    intervention: null,
    ...overrides,
  }
}

const clone = (row: AdminClaimWire): AdminClaimWire => ({
  ...row,
  productNames: [...row.productNames],
  order: { ...row.order },
  items: row.items.map(item => ({ ...item })),
  intervention: row.intervention ? { ...row.intervention } : null,
})

export function seedAdminClaims(rows: AdminClaimWire[] = []): void {
  claims = rows.map(clone)
}

/** 핸들러가 반영한 현재 클레임 상태 — 테스트가 개입의 부작용을 읽는다. */
export function currentAdminClaim(claimPublicId: string): AdminClaimWire | null {
  const found = claims.find(row => row.claimPublicId === claimPublicId)
  return found ? clone(found) : null
}

/**
 * 개입 가능 여부 — 상태 전이가 열려 있고 환불이 한 번도 움직이지 않았고 교환이 재발송으로
 * 끝나지 않은 건만(BE Claim.isAdminOverridable). 개입 기록이 이미 있으면 그 상태가
 * ADMIN_OVERRIDDEN이라 첫 조건에서 걸린다.
 */
function interventionAllowed(row: AdminClaimWire): boolean {
  const exchangeSettled =
    row.claimType === 'EXCHANGE' && row.status === 'APPROVED' && row.resolvedAt != null
  return (
    ADMIN_OVERRIDABLE.includes(row.status) &&
    (row.refundStatus == null || row.refundStatus === 'NONE') &&
    !exchangeSettled
  )
}

function summaryOf(row: AdminClaimWire) {
  return {
    claimPublicId: row.claimPublicId,
    orderPublicId: row.orderPublicId,
    claimType: row.claimType,
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    reasonDetail: row.reasonDetail,
    status: row.status,
    refundStatus: row.refundStatus,
    sellerApprovalStatus: row.sellerApprovalStatus,
    settlementStatus: row.settlementStatus,
    returnCostBearer: row.returnCostBearer,
    refundAmount: row.refundAmount,
    returnShippingFee: row.returnShippingFee,
    productNames: [...row.productNames],
    itemCount: row.itemCount,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    buyerPublicId: row.buyerPublicId,
    buyerNickname: row.buyerNickname,
    faultDecision: row.intervention?.faultDecision ?? null,
    interventionAllowed: interventionAllowed(row),
    requestedAt: row.requestedAt,
    autoApproveDueAt: row.autoApproveDueAt,
    approvedAt: row.approvedAt,
    resolvedAt: row.resolvedAt,
    disputeElapsedDays: row.disputeElapsedDays,
  }
}

/** 이력은 전용 테이블이 없어 클레임의 시각 칼럼에서 조립한다(BE AdminClaimDetailResult.historyOf). */
function historyOf(row: AdminClaimWire) {
  const entries: { event: string; occurredAt: string }[] = []
  if (row.requestedAt) entries.push({ event: 'REQUESTED', occurredAt: row.requestedAt })
  if (row.collectionStartedAt)
    entries.push({ event: 'COLLECTION_STARTED', occurredAt: row.collectionStartedAt })
  if (row.approvedAt) entries.push({ event: 'APPROVED', occurredAt: row.approvedAt })
  if (row.intervention) {
    if (row.intervention.previousResolvedAt) {
      entries.push({
        event: closingEventOf(row.intervention.previousStatus, row.refundStatus),
        occurredAt: row.intervention.previousResolvedAt,
      })
    }
    entries.push({ event: 'ADMIN_OVERRIDDEN', occurredAt: row.intervention.intervenedAt })
  } else if (row.resolvedAt) {
    entries.push({ event: closingEventOf(row.status, row.refundStatus), occurredAt: row.resolvedAt })
  }
  return entries.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0))
}

function closingEventOf(status: WireClaimStatus, refundStatus: WireRefundStatus | null): string {
  if (refundStatus === 'DONE') return 'REFUNDED'
  if (status === 'REJECTED') return 'REJECTED'
  if (status === 'WITHDRAWN') return 'WITHDRAWN'
  if (status === 'ADMIN_OVERRIDDEN') return 'ADMIN_OVERRIDDEN'
  return 'RESOLVED'
}

function detailOf(row: AdminClaimWire) {
  return {
    claim: summaryOf(row),
    order: {
      orderPublicId: row.orderPublicId,
      orderStatus: row.order.orderStatus,
      orderedAt: row.order.orderedAt,
      sellerShippingFee: row.order.sellerShippingFee,
      recipientName: row.order.recipientName,
      contactNumber: row.order.contactNumber,
      zipCode: row.order.zipCode,
      baseAddress: row.order.baseAddress,
      detailAddress: row.order.detailAddress,
      deliveryMemo: row.order.deliveryMemo,
    },
    buyerStatement: {
      reasonCode: row.reasonCode,
      reasonLabel: row.reasonLabel,
      reasonDetail: row.reasonDetail,
      requestedAt: row.requestedAt,
    },
    sellerHandling: {
      sellerApprovalStatus: row.sellerApprovalStatus,
      rejectionReason: row.rejectionReason,
      sellerMemo: row.sellerMemo,
      returnCostBearer: row.returnCostBearer,
      autoApproveDueAt: row.autoApproveDueAt,
      approvedAt: row.approvedAt,
      collectionStartedAt: row.collectionStartedAt,
    },
    items: row.items.map(item => ({ ...item })),
    history: historyOf(row),
    intervention: row.intervention ? { ...row.intervention } : null,
  }
}

const CURSOR_TAG = 'acl'

const encodeCursor = (sort: string, lastIndex: number) =>
  encodeCursorPayload(`${CURSOR_TAG}:${sort}:${lastIndex}`)

function decodeCursor(raw: string): { sort: string; lastIndex: number } | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split(':')
  if (parts.length !== 3 || parts[0] !== CURSOR_TAG) return null
  const lastIndex = Number(parts[2])
  return Number.isFinite(lastIndex) ? { sort: parts[1]!, lastIndex } : null
}

export const claimHandlers = [
  http.get(ADMIN_CLAIM_REASONS_URL, () =>
    HttpResponse.json({
      data: {
        faultDecisions: (Object.keys(REASON_CATALOG) as WireFaultDecision[]).map(faultDecision => ({
          faultDecision,
          claimAccepted: FAULT_DECISIONS[faultDecision].claimAccepted,
          reasons: REASON_CATALOG[faultDecision].map(reason => ({ ...reason })),
        })),
      },
    }),
  ),

  http.get(ADMIN_CLAIMS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    // 배열 쿼리는 반복 파라미터로 나간다(`?status=A&status=B`) — getAll이 그 계약을 고정한다.
    const claimTypes = params.getAll('claimType')
    const statuses = params.getAll('status')
    const orderPublicId = params.get('orderPublicId')
    const sellerKeyword = params.get('sellerKeyword')
    const buyerKeyword = params.get('buyerKeyword')
    const openOnlyParam = params.get('openOnly')
    const sort = params.get('sort') ?? 'OLDEST_FIRST'
    const size = clampSize(params.get('size'))
    const cursorParam = params.get('cursor')
    let anchorIndex: number | null = null
    if (cursorParam != null) {
      const decoded = decodeCursor(cursorParam)
      if (!decoded) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
      anchorIndex = decoded.lastIndex
    }
    // openOnly를 주지 않으면 status가 빈 요청에서만 개입 가능한 건으로 좁힌다.
    const openOnly = openOnlyParam == null ? statuses.length === 0 : openOnlyParam === 'true'

    const matched = claims
      .filter(row => claimTypes.length === 0 || claimTypes.includes(row.claimType))
      .filter(row => statuses.length === 0 || statuses.includes(row.status))
      // 주문번호는 완전일치, 셀러·구매자는 부분일치다(BE AdminClaimQueryAdapter).
      .filter(row => orderPublicId == null || row.orderPublicId === orderPublicId)
      .filter(row => sellerKeyword == null || (row.sellerName ?? '').includes(sellerKeyword))
      .filter(row => buyerKeyword == null || (row.buyerNickname ?? '').includes(buyerKeyword))
      .filter(row => !openOnly || interventionAllowed(row))

    const sorted = [...matched].sort((a, b) => {
      const left = a.requestedAt ?? ''
      const right = b.requestedAt ?? ''
      const asc = left < right ? -1 : left > right ? 1 : a.claimPublicId < b.claimPublicId ? -1 : 1
      return sort === 'LATEST_FIRST' ? -asc : asc
    })
    const start = anchorIndex == null ? 0 : anchorIndex
    const page = sorted.slice(start, start + size)
    const hasNext = sorted.length > start + size
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext ? encodeCursor(sort, start + size) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_CLAIM_DETAIL_URL, ({ params }) => {
    const row = claims.find(item => item.claimPublicId === String(params['claimPublicId']))
    if (!row) {
      return HttpResponse.json(errorBody(50400, '클레임을 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({ data: detailOf(row) })
  }),

  http.post(ADMIN_CLAIM_INTERVENE_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      faultDecision?: WireFaultDecision
      reason?: WireInterventionReason
      reasonDetail?: string
      returnCostBearer?: WireCostBearer
      internalMemo?: string
    } | null
    const faultDecision = body?.faultDecision
    const reason = body?.reason
    // @Valid가 먼저다 — 필드 누락과 길이 초과는 모두 90001이다.
    if (faultDecision == null || reason == null || !(faultDecision in FAULT_DECISIONS)) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    if (
      (body?.reasonDetail ?? '').length > REASON_DETAIL_MAX ||
      (body?.internalMemo ?? '').length > MEMO_MAX
    ) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    const row = claims.find(item => item.claimPublicId === String(params['claimPublicId']))
    if (!row) {
      return HttpResponse.json(errorBody(50400, '클레임을 찾을 수 없습니다.'), { status: 404 })
    }
    const selectable = REASON_CATALOG[faultDecision].find(option => option.code === reason)
    // 사유·상세 검증이 상태 판정보다 먼저다(BE Claim.overrideByAdmin 순서).
    if (!selectable) {
      return HttpResponse.json(
        errorBody(50415, '귀책 판정에서 선택할 수 없는 개입 사유입니다.'),
        { status: 400 },
      )
    }
    if (selectable.detailRequired && (body?.reasonDetail ?? '').trim() === '') {
      return HttpResponse.json(
        errorBody(50416, '기타 사유를 선택하면 상세 내용을 입력해 주세요.'),
        { status: 400 },
      )
    }
    // 두 번째 개입도 여기로 온다 — 개입 기록 1행이 멱등 게이트다.
    if (!interventionAllowed(row)) {
      return HttpResponse.json(errorBody(50414, '운영자가 개입할 수 없는 클레임입니다.'), {
        status: 409,
      })
    }

    const previousStatus = row.status
    const previousSellerApprovalStatus = row.sellerApprovalStatus
    const previousResolvedAt = row.resolvedAt
    const accepted = FAULT_DECISIONS[faultDecision].claimAccepted
    row.status = 'ADMIN_OVERRIDDEN'
    // 반품 발송이 없는 자리(취소 클레임·클레임 불가)에서는 명시값도 비운다.
    row.returnCostBearer =
      row.claimType === 'CANCEL' || !accepted
        ? null
        : (body?.returnCostBearer ?? FAULT_DECISIONS[faultDecision].defaultCostBearer)
    row.resolvedAt = '2026-10-30T09:00:00'
    row.intervention = {
      adminId: ACTING_ADMIN_ID,
      faultDecision,
      claimAccepted: accepted,
      reason,
      reasonLabel: selectable.label,
      reasonDetail: body?.reasonDetail?.trim() || null,
      returnCostBearer: row.returnCostBearer,
      previousStatus,
      previousSellerApprovalStatus,
      previousResolvedAt,
      internalMemo: body?.internalMemo?.trim() || null,
      intervenedAt: '2026-10-30T09:00:00',
    }
    return HttpResponse.json({
      data: {
        claimPublicId: row.claimPublicId,
        status: row.status,
        returnCostBearer: row.returnCostBearer,
        refundStatus: row.refundStatus,
        // 개입은 환불을 집행하지 않는다 — 응답이 그 사실을 못박는다.
        refundSettled: row.refundStatus === 'DONE',
        intervention: { ...row.intervention },
      },
    })
  }),
]

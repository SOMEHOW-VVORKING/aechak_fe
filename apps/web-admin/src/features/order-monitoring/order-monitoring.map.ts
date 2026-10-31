import type {
  AdminOrderDetailData,
  AdminOrderDispatchNudge,
  AdminOrderItem,
  AdminOrderStatusHistory,
  AdminOrderSummary,
  ClaimStatus,
  ClaimType,
  OrderItemStatus,
  OrderStatus,
  TriggeredBy,
} from '@aechak/api'

// 와이어 enum은 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 AdminOrderStatus 어휘만 쓰고
// 서버 OrderStatus·ClaimType·ClaimStatus·TriggeredBy는 여기서만 등장한다.
//
// `GET /admin/orders`가 생기기 전까지 이 화면은 예시 데이터였고, 그때의 FE 상태 어휘는 여섯 값
// (paid/preparing/shipping/delivered/confirmed/claimed)이었다. 서버와 맞춰 보니 두 군데가 어긋났다.
//
// 1. 서버에 있는 `DISPATCH_PENDING`(발송 대기)과 `CANCELLED`가 FE에 없었다. 발송 대기는 지표
//    카드 `awaitingDispatchCount`의 모수에 들어가는 상태라, 빼면 카드 숫자와 목록 행이 어긋난다.
// 2. FE에 있던 `claimed`는 **서버 상태가 아니다.** 클레임은 주문 상태와 별개 축이고 서버는
//    `activeClaim`으로 따로 내려준다 — 상태 하나로 접으면 "반품 접수된 배송완료 주문"의 배송
//    상태가 화면에서 사라진다. 그래서 상태 pill은 서버 상태 그대로 그리고 클레임은 별도 pill이다.
//
// 결과적으로 이 어휘는 서버 OrderStatus 8값과 1:1이다.

export type AdminOrderStatus =
  | 'pendingPayment'
  | 'paid'
  | 'preparing'
  | 'dispatchPending'
  | 'shipping'
  | 'delivered'
  | 'confirmed'
  | 'cancelled'

const STATUS_FROM_WIRE: Record<OrderStatus, AdminOrderStatus> = {
  PENDING_PAYMENT: 'pendingPayment',
  PAID: 'paid',
  PREPARING: 'preparing',
  DISPATCH_PENDING: 'dispatchPending',
  SHIPPING: 'shipping',
  DELIVERED: 'delivered',
  PURCHASE_CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
}

/**
 * 목록 상태 필터의 와이어 값. 'all'은 파라미터 자체를 보내지 않는다.
 *
 * **`pendingPayment`는 없다** — 결제대기는 결제 전에도 주문 테이블에 남는 행이라 서버가 모니터링
 * 대상에서 빼고, 필터로 지정하면 400(90001)으로 끊는다. 고를 수 있게 두면 운영자가 고르는 즉시
 * 목록이 에러로 바뀐다(AGENTS 2절이 금지한 동작 안 하는 필터).
 */
export const STATUS_FILTER_TO_WIRE = {
  paid: 'PAID',
  preparing: 'PREPARING',
  dispatchPending: 'DISPATCH_PENDING',
  shipping: 'SHIPPING',
  delivered: 'DELIVERED',
  confirmed: 'PURCHASE_CONFIRMED',
  cancelled: 'CANCELLED',
} as const satisfies Partial<Record<AdminOrderStatus, OrderStatus>>

export type AdminOrderStatusFilterValue = 'all' | keyof typeof STATUS_FILTER_TO_WIRE

/**
 * 독촉을 걸 수 있는 상태 — BE `OrderStatus.isAwaitingDispatch()`와 같은 집합이다.
 *
 * 서버가 그 밖의 상태를 409(50500)로 거절하므로, 걸 수 없는 행에서 버튼을 눌러 보게 두면
 * 확인 Modal을 지나 실패 토스트에 도달한다. 눌릴 수 있는 자리에서 미리 가른다.
 */
const NUDGEABLE_STATUSES: readonly AdminOrderStatus[] = ['paid', 'preparing', 'dispatchPending']

/** 지연 사유 — 서버 판정이다(기준은 `order.dispatch.sla-days`·`order.delivery.sla-days`). */
const DELAY_NOTES = {
  DISPATCH_OVERDUE: '발송 기한이 지났는데 송장이 등록되지 않았어요.',
  DELIVERY_OVERDUE: '배송 중 상태로 기한을 넘겼어요. 배송 정체를 확인해 주세요.',
} as const

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  CANCEL: '취소',
  RETURN: '반품',
  EXCHANGE: '교환',
}

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  CLAIM_REQUESTED: '접수',
  COLLECTING: '회수 중',
  APPROVED: '승인',
  REJECTED: '반려',
  ADMIN_OVERRIDDEN: '운영자 개입',
  REFUND_FAILED: '환불 실패',
  WITHDRAWN: '철회',
}

export const ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  ORDERED: '주문',
  CANCELLED: '취소',
  RETURN_REQUESTED: '반품 접수',
  RETURNED: '반품 완료',
  EXCHANGE_REQUESTED: '교환 접수',
}

export const TRIGGERED_BY_LABELS: Record<TriggeredBy, string> = {
  SYSTEM: '시스템',
  BUYER: '구매자',
  SELLER: '셀러',
  ADMIN: '운영자',
}

/** 오프셋 없는 LocalDateTime을 'MM-DD HH:mm'으로. 목록·타임라인이 분 단위로 읽는다. */
export function toTimeLabel(isoLocal: string): string {
  return `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`
}

export interface AdminOrderMonitorRow {
  /** 주문 공개 식별자(ULID). 상세·독촉 경로가 지목하는 값이고 행 키다. */
  orderId: string
  status: AdminOrderStatus
  orderedAtLabel: string
  sellerName: string
  buyerNickname: string
  /** '대표 품목명 외 N건'. 목록 응답에 품목 전문이 없어 서버가 준 두 필드로 조립한다. */
  itemSummary: string
  /** 서버가 계산한 결제 금액. 화면이 금액을 더하거나 빼지 않는다. */
  payableAmount: number
  delayed: boolean
  /** 지연이 아니면 null. 판정은 서버가 한다. */
  delayNote: string | null
  courierName: string | null
  trackingNumber: string | null
  /** 진행 중 클레임 한 줄. 주문 상태와 별개 축이라 상태 pill과 겹치지 않는다. */
  claimLabel: string | null
  nudgeable: boolean
}

export function toMonitorRow(wire: AdminOrderSummary): AdminOrderMonitorRow {
  const status = STATUS_FROM_WIRE[wire.status]
  const itemName = wire.representativeItemName
  return {
    orderId: wire.orderId,
    status,
    orderedAtLabel: toTimeLabel(wire.orderedAt),
    // 스토어명이 비어 있는 셀러는 서버가 null을 준다 — 빈 칸보다 "이름 없음"이 읽힌다.
    sellerName: wire.sellerName ?? '스토어명 없음',
    buyerNickname: wire.buyerNickname,
    itemSummary:
      itemName == null
        ? `${wire.itemCount}개 품목`
        : wire.itemCount > 1
          ? `${itemName} 외 ${wire.itemCount - 1}건`
          : itemName,
    payableAmount: wire.payableAmount,
    delayed: wire.delayed,
    delayNote: wire.delayReason ? DELAY_NOTES[wire.delayReason] : null,
    courierName: wire.shipment?.courierName ?? null,
    trackingNumber: wire.shipment?.trackingNumber ?? null,
    claimLabel: wire.activeClaim
      ? `${CLAIM_TYPE_LABELS[wire.activeClaim.claimType]} / ${CLAIM_STATUS_LABELS[wire.activeClaim.status]}`
      : null,
    nudgeable: NUDGEABLE_STATUSES.includes(status),
  }
}

export interface AdminOrderStage {
  label: string
  sublabel?: string
  status: 'done' | 'active' | 'todo'
}

/**
 * 배송 진행 타임라인의 단계 이름과 표시 규칙은 **화면이 정한다**(서버는 전이 이력만 준다).
 *
 * 사다리는 결제완료 → 상품준비 → 발송대기 → 배송중 → 배송완료 → 구매확정이고, 이력의
 * `occurredAt`을 각 단계의 보조 텍스트로 붙인다. 취소는 사다리 밖이라 **지금까지 올라간 칸을
 * 남긴 뒤** 마지막에 취소 단계를 덧붙인다 — 취소를 사다리에 끼우면 "어디까지 갔다가 취소됐는지"가
 * 사라진다.
 */
const STAGE_LADDER: readonly { status: AdminOrderStatus; label: string }[] = [
  { status: 'paid', label: '결제 완료' },
  { status: 'preparing', label: '상품 준비' },
  { status: 'dispatchPending', label: '발송 대기' },
  { status: 'shipping', label: '배송 중' },
  { status: 'delivered', label: '배송 완료' },
  { status: 'confirmed', label: '구매 확정' },
]

export function toStages(
  status: AdminOrderStatus,
  history: readonly AdminOrderStatusHistory[],
): AdminOrderStage[] {
  const occurredAt = new Map<AdminOrderStatus, string>()
  for (const entry of history) occurredAt.set(STATUS_FROM_WIRE[entry.toStatus], entry.occurredAt)

  const ladderIndexOf = (value: AdminOrderStatus) =>
    STAGE_LADDER.findIndex(stage => stage.status === value)

  // 취소 주문은 현재 상태가 사다리에 없다 — 이력에서 가장 멀리 올라간 칸을 현재 위치로 쓴다.
  const cancelled = status === 'cancelled'
  const reachedIndex = cancelled
    ? Math.max(-1, ...[...occurredAt.keys()].map(ladderIndexOf))
    : ladderIndexOf(status)

  const stages: AdminOrderStage[] = STAGE_LADDER.map((stage, index) => {
    const at = occurredAt.get(stage.status)
    const stepStatus: AdminOrderStage['status'] =
      index < reachedIndex || (cancelled && index <= reachedIndex)
        ? 'done'
        : index === reachedIndex
          ? 'active'
          : 'todo'
    return { label: stage.label, status: stepStatus, ...(at ? { sublabel: toTimeLabel(at) } : {}) }
  })

  if (cancelled) {
    const at = occurredAt.get('cancelled')
    stages.push({ label: '주문 취소', status: 'active', ...(at ? { sublabel: toTimeLabel(at) } : {}) })
  }
  return stages
}

export interface AdminOrderItemView {
  orderItemId: number
  productName: string
  optionName: string | null
  quantity: number
  unitPrice: number
  itemStatusLabel: string
}

export interface AdminOrderNudgeView {
  nudgeId: number
  label: string
  date: string
  memo: string | null
}

export interface AdminOrderDetailView {
  order: AdminOrderMonitorRow
  orderGroupId: string
  items: AdminOrderItemView[]
  stages: AdminOrderStage[]
  nudges: AdminOrderNudgeView[]
}

const toItemView = (wire: AdminOrderItem): AdminOrderItemView => ({
  orderItemId: wire.orderItemId,
  productName: wire.productName,
  optionName: wire.optionName,
  quantity: wire.quantity,
  unitPrice: wire.unitPrice,
  itemStatusLabel: ITEM_STATUS_LABELS[wire.itemStatus],
})

/** 독촉 이력 행. 서버가 알림을 보내지 않으므로 라벨도 "기록"이다. */
const toNudgeView = (wire: AdminOrderDispatchNudge): AdminOrderNudgeView => ({
  nudgeId: wire.nudgeId,
  label: `운영자 ${wire.adminUserId} 독촉 기록`,
  date: toTimeLabel(wire.nudgedAt),
  memo: wire.memo,
})

export function toDetailView(wire: AdminOrderDetailData): AdminOrderDetailView {
  const order = toMonitorRow(wire.order)
  return {
    order,
    orderGroupId: wire.orderGroupId,
    items: wire.items.map(toItemView),
    stages: toStages(order.status, wire.statusHistory),
    // 최신 기록이 위로 — 서버는 주문 id 오름차순으로 준다.
    nudges: [...wire.nudges].sort((a, b) => b.nudgeId - a.nudgeId).map(toNudgeView),
  }
}

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

const FORBIDDEN_BY_ROLE = 20011

function isForbiddenByRole(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  return status === 403 && errorCode === FORBIDDEN_BY_ROLE
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 주문 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  // 90002는 필터를 바꾼 채 옛 커서를 보낸 경우다 — 필터를 쿼리 키에 넣어 커서 사슬을 새로
  // 시작하므로 정상 흐름에서는 나오지 않지만, 나오면 처음부터 다시 받아야 한다.
  if (status === 400 && errorCode === 90002)
    return '목록 조건이 바뀌었어요. 필터를 다시 선택해 처음부터 불러와 주세요.'
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 필터와 검색어를 확인해 주세요.'
  return '주문 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function metricsErrorMessage(error: unknown): string {
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 지표를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  return '지표를 불러오지 못했어요. 숫자를 비워 두었어요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 주문 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '주문을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '주문 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 독촉 실패 문구. 409 둘은 운영자가 할 일이 서로 달라 한 문구로 묶지 않는다 — 상태가 지나간 건은
 * 다시 눌러도 안 되고, 쿨다운은 기다리면 된다.
 */
export function nudgeErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  // 서버는 발송 전 상태(결제완료·상품준비·발송대기)가 아닌 **전부**를 50500으로 끊는다 —
  // 취소된 주문도 여기 든다. "이미 발송됐다"고 적으면 취소 건에서 거짓이 되고, "다시 불러왔다"는
  // 무효화 뒤 재조회가 실패할 수 있어 단정할 수 없다(교차검토 지적).
  if (status === 409 && errorCode === 50500)
    return '발송 전 상태의 주문이 아니라 독촉을 기록할 수 없어요. 주문 상태를 다시 확인해 주세요.'
  if (status === 409 && errorCode === 50501)
    return '직전 독촉에서 아직 시간이 덜 지났어요. 잠시 뒤에 다시 시도해 주세요.'
  if (status === 400 && (errorCode === 50502 || errorCode === 90001))
    return '독촉 메모는 300자까지 적을 수 있어요.'
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '주문을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '독촉을 기록하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

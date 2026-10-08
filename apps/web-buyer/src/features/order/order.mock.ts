import type { BuyerOrder, BuyerOrderStatus, PaymentMethod } from '@aechak/domain'
import type { StatusPillVariant, TimelineStep } from '@aechak/design-system/web'
import { findProduct } from '@/shared/catalog'

// 결제 수단 표시 라벨(환불 수단 등). 카피 컨벤션에 따라 구분자는 '/'.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  kakaopay: '카카오페이',
  tosspay: '토스페이',
  card: '신용/체크카드',
}

// 구매자 주문 화면(b4-st-1 목록 / b1-st-6 상세 / b4-st-4 취소) 공용 상수·파생 로직.
// 실제 주문 데이터는 shared/order 스토어가 단일 소스이고, 여기서는 라벨/색/필터/타임라인만 다룬다.

// 상태 라벨(구매자 관점). 셀러용 ORDER_STATUS_LABEL과 별개다(상태머신 자체가 다름).
export const ORDER_STATUS_LABEL: Record<BuyerOrderStatus, string> = {
  paid: '결제완료',
  preparing: '상품준비중',
  shipping: '배송중',
  delivered: '배송완료',
  confirmed: '구매확정',
  cancelled: '취소완료',
}

// 상태 pill 색(주문 상태머신) — 배송중 info / 배송완료·결제완료·구매확정 success / 준비중 warning /
// 취소완료 muted. muted는 비활성/종료 상태에만 쓰는 규칙(디자인시스템 컨벤션)에 맞다.
export const ORDER_STATUS_VARIANT: Record<BuyerOrderStatus, StatusPillVariant> = {
  paid: 'success',
  preparing: 'warning',
  shipping: 'info',
  delivered: 'success',
  confirmed: 'success',
  cancelled: 'muted',
}

// 상태 세그먼트(전체/진행중/완료/취소). 반품/교환 플로우는 앱에 없어 취소완료만 담는다.
export type OrderSegment = 'all' | 'in-progress' | 'done' | 'canceled'

export const ORDER_SEGMENTS: { value: OrderSegment; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'in-progress', label: '진행중' },
  { value: 'done', label: '완료' },
  { value: 'canceled', label: '취소' },
]

// 세그먼트 → 포함 상태. null이면 전체.
const SEGMENT_STATUSES: Record<OrderSegment, BuyerOrderStatus[] | null> = {
  all: null,
  'in-progress': ['paid', 'preparing', 'shipping'],
  done: ['delivered', 'confirmed'],
  canceled: ['cancelled'],
}

export function filterOrdersBySegment(
  orders: readonly BuyerOrder[],
  segment: OrderSegment,
): BuyerOrder[] {
  const statuses = SEGMENT_STATUSES[segment]
  if (statuses == null) return [...orders]
  return orders.filter(o => statuses.includes(o.status))
}

// 배송 시작 전(결제완료/상품준비중)만 취소할 수 있다. 배송중/완료/구매확정/취소완료는 취소 불가
// (배송 후는 반품/교환으로 — 이번 범위 밖).
export function isCancelable(status: BuyerOrderStatus): boolean {
  return status === 'paid' || status === 'preparing'
}

// 주문 취소 사유(b4-st-4). 마지막 '기타'는 직접 입력 텍스트를 함께 받는다.
export const CANCEL_REASONS: { value: string; label: string; needsDetail?: boolean }[] = [
  { value: 'change-mind', label: '단순 변심' },
  { value: 'wrong-order', label: '상품을 잘못 주문함' },
  { value: 'late-delivery', label: '배송이 너무 늦어짐' },
  { value: 'reorder', label: '다른 상품으로 재주문' },
  { value: 'etc', label: '기타 (직접 입력)', needsDetail: true },
]

// 'YYYY.MM.DD ...' → 'MM.DD' 표기(타임라인/카드 보조 텍스트용). 값이 있으면 항상 문자열을 돌려준다.
export function shortDate(value: string): string
export function shortDate(value: string | undefined): string | undefined
export function shortDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = value.match(/^\d{4}\.(\d{2})\.(\d{2})/)
  return m ? `${m[1]}.${m[2]}` : value
}

// 주문 스냅샷 항목에 카탈로그 실루엣 썸네일을 채운다. 시드/mock 주문은 thumbnailUrl을 안 담아
// 카드가 "빈 이미지" 아이콘으로 빠지던 걸, 상품 id로 카탈로그를 참조해 다른 화면(카탈로그/장바구니/
// 상세)과 동일한 실루엣 썸네일로 통일한다. 이미 담긴 주문(결제 생성분)은 그대로 둔다(멱등).
// order.store(shared/order)는 boundaries상 shared/catalog를 import할 수 없어, feature 읽기
// 계층인 여기서 채운다 — 스냅샷 생성 시점과 사실상 동일하게 상품 id로 카탈로그를 끌어와 채우는 것.
export function withCatalogThumbnails(order: BuyerOrder): BuyerOrder {
  return {
    ...order,
    groups: order.groups.map(group => ({
      ...group,
      items: group.items.map(item =>
        item.thumbnailUrl
          ? item
          : { ...item, thumbnailUrl: findProduct(item.productId)?.thumbnailUrl },
      ),
    })),
  }
}

// 주문의 전체 상품 수(모든 셀러 그룹 합산).
export function orderItemCount(order: BuyerOrder): number {
  return order.groups.reduce((sum, g) => sum + g.items.length, 0)
}

// 목록 카드 제목 — 첫 상품명 + "외 N개".
export function orderTitle(order: BuyerOrder): string {
  const first = order.groups[0]?.items[0]
  if (!first) return '주문 상품'
  const rest = orderItemCount(order) - 1
  return rest > 0 ? `${first.name} 외 ${rest}개` : first.name
}

const TIMELINE_SEQUENCE: { status: BuyerOrderStatus; label: string }[] = [
  { status: 'paid', label: '결제완료' },
  { status: 'preparing', label: '상품준비중' },
  { status: 'shipping', label: '배송중' },
  { status: 'delivered', label: '배송완료' },
  { status: 'confirmed', label: '구매확정' },
]

// 배송 추적 타임라인(b1-st-6). 현재 상태까지는 done, 현재 단계는 active, 이후는 todo.
// 취소완료 주문에는 쓰지 않는다(상세가 취소 안내 블록을 대신 렌더).
export function buildOrderTimeline(order: BuyerOrder): TimelineStep[] {
  const currentIndex = TIMELINE_SEQUENCE.findIndex(s => s.status === order.status)
  return TIMELINE_SEQUENCE.map((step, i) => {
    const status: TimelineStep['status'] =
      i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo'
    return { label: step.label, sublabel: timelineSublabel(order, step.status, i, currentIndex), status }
  })
}

function timelineSublabel(
  order: BuyerOrder,
  step: BuyerOrderStatus,
  index: number,
  currentIndex: number,
): string | undefined {
  const orderedDate = shortDate(order.orderedAt)
  switch (step) {
    case 'paid':
      return orderedDate
    case 'preparing':
      return orderedDate
    case 'shipping': {
      const base = shortDate(order.shippedAt)
      if (order.shipment) {
        return `${base ? `${base} / ` : ''}${order.shipment.courier} ${order.shipment.trackingNumber}`
      }
      return base
    }
    case 'delivered':
      return shortDate(order.deliveredAt)
    case 'confirmed':
      // 아직 도달 못 한 단계(todo)면 자동 확정 예정 안내, 도달했으면 확정일.
      if (index > currentIndex) {
        const auto = shortDate(order.autoConfirmAt)
        return auto ? `${auto} 자동 구매확정 예정` : '배송완료 후 자동 구매확정'
      }
      return shortDate(order.confirmedAt)
    default:
      return undefined
  }
}

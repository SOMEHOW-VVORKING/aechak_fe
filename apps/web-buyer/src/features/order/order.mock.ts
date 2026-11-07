import type {
  BuyerClaimCostBearer,
  BuyerClaimRefundStatus,
  BuyerClaimStatus,
  BuyerClaimType,
  BuyerOrderClaim,
  BuyerOrderDetail,
  BuyerOrderItem,
  BuyerOrderItemStatus,
  BuyerOrderStatus,
  BuyerSellerOrder,
} from '@aechak/domain'
import type { StatusPillVariant } from '@aechak/design-system/web'
import type { OrderSegment } from '@/shared/order'

// 구매자 주문 화면(b4-st-1 목록 / b1-st-6 상세) 공용 상수·표시 헬퍼. 주문 데이터는 shared/order 어댑터가
// 서버에서 읽고, 여기서는 라벨/색/세그먼트/날짜 포맷만 다룬다.

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

// 품목 상태 보조 라벨. 정상 주문(ordered)은 라벨 없음.
export const ORDER_ITEM_STATUS_LABEL: Partial<Record<BuyerOrderItemStatus, string>> = {
  cancelled: '취소',
  'return-requested': '반품 요청',
  returned: '반품 완료',
  'exchange-requested': '교환 요청',
}

// 클레임 유형 라벨.
export const CLAIM_TYPE_LABEL: Record<BuyerClaimType, string> = {
  cancel: '취소',
  return: '반품',
  exchange: '교환',
}

// 요청 화면·버튼에 쓰는 유형별 동작 이름("취소 신청"처럼 뒤에 붙는 말이 유형마다 달라 따로 둔다).
export const CLAIM_ACTION_LABEL: Record<BuyerClaimType, string> = {
  cancel: '주문 취소',
  return: '반품 신청',
  exchange: '교환 신청',
}

// 상태 문구는 서버 ClaimStatus 7종을 구매자 관점으로 옮긴 것. 운영자 직권 처리와 환불 실패는
// 구매자가 할 수 있는 일이 없어 "확인 중"으로 묶지 않고 그대로 알린다.
export const CLAIM_STATUS_LABEL: Record<BuyerClaimStatus, string> = {
  requested: '판매자 확인 대기',
  collecting: '회수 진행 중',
  approved: '승인',
  'admin-overridden': '운영자 처리',
  'refund-failed': '환불 실패',
  rejected: '거부',
  withdrawn: '철회',
}

// 거부는 부정적 결과이지만 제재가 아니라 `error`, 철회는 구매자가 스스로 거둔 종결이라 `muted`
// (비활성·종료 상태 전용 규칙에 맞는다 — 디자인시스템 컨벤션).
export const CLAIM_STATUS_VARIANT: Record<BuyerClaimStatus, StatusPillVariant> = {
  requested: 'warning',
  collecting: 'info',
  approved: 'success',
  'admin-overridden': 'neutral',
  'refund-failed': 'error',
  rejected: 'error',
  withdrawn: 'muted',
}

// 반품 발송비 부담 주체 문구. 셀러 승인 때 정해지고, 기한 초과 자동승인은 정하지 않아 값이 없다.
export const CLAIM_COST_BEARER_LABEL: Record<BuyerClaimCostBearer, string> = {
  buyer: '반품 발송비는 구매자 부담이에요',
  seller: '반품 발송비는 판매자 부담이에요',
}

// 환불 진행 보조 라벨. NONE(교환 등 환불이 없는 건)은 라벨 없음.
export const CLAIM_REFUND_STATUS_LABEL: Partial<Record<BuyerClaimRefundStatus, string>> = {
  requested: '환불 요청됨',
  done: '환불 완료',
  failed: '환불 실패',
}

// 상태 세그먼트(전체/진행중/완료/취소). 서버 status 필터 매핑은 shared/order 어댑터가 맡는다.
export const ORDER_SEGMENTS: { value: OrderSegment; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'in-progress', label: '진행중' },
  { value: 'done', label: '완료' },
  { value: 'canceled', label: '취소' },
]

/**
 * 구매확정 가능 여부 — be OrderConfirmService의 판정을 그대로 옮긴다.
 * 배송완료(DELIVERED) + 진행 중 클레임 없음. 둘 중 하나라도 어긋나면 서버가 409 50007로 거절하므로
 * 버튼을 띄우지 않는다(서버가 최종 심판이고 화면은 헛된 요청을 줄이는 쪽).
 */
export function isConfirmable(order: BuyerOrderDetail): boolean {
  return order.status === 'delivered' && order.activeClaim == null
}

/**
 * 리뷰를 쓸 수 있는 품목 — be는 구매확정(PURCHASE_CONFIRMED) + 품목 ORDERED만 받고
 * 확정 30일 이내여야 한다(ReviewErrorCode 110007·110010·110008).
 * 기한과 중복 작성 여부는 주문 상세 응답으로 알 수 없어 서버가 판정한다 — 리뷰 작성 화면이 그 거절을 안내한다.
 */
export function isReviewable(order: BuyerOrderDetail, item: BuyerOrderItem): boolean {
  return order.status === 'confirmed' && item.itemStatus === 'ordered'
}

// 서버 orderedAt(ISO, 오프셋 포함)을 한국 시간 기준으로 그린다 — 머신 TZ(CI는 UTC)에 따라 날짜가
// 흔들리지 않게 Asia/Seoul을 고정한다.
const SEOUL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function seoulParts(iso: string): Record<string, string> | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return Object.fromEntries(SEOUL.formatToParts(date).map(part => [part.type, part.value]))
}

// 'YYYY.MM.DD HH:mm' — 상세의 주문 일시. 파싱 실패면 원문 그대로.
export function formatOrderedAt(iso: string): string {
  const p = seoulParts(iso)
  return p ? `${p['year']}.${p['month']}.${p['day']} ${p['hour']}:${p['minute']}` : iso
}

// 'MM.DD' — 목록 카드 헤더의 주문일.
export function shortDate(iso: string): string {
  const p = seoulParts(iso)
  return p ? `${p['month']}.${p['day']}` : iso
}

// 'MM.DD HH:mm' — 배송 발송·완료 시각 등 연도까지 필요 없는 자리.
export function shortDateTime(iso: string): string {
  const p = seoulParts(iso)
  return p ? `${p['month']}.${p['day']} ${p['hour']}:${p['minute']}` : iso
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * 자동 구매확정까지 남은 시간. 기한을 지났거나 파싱 실패면 null — 호출부가 문구를 숨긴다.
 * `now`를 받는 이유는 테스트가 고정 시각을 넣기 때문이고, 기본값은 호출 시점이다.
 */
export function confirmDueRemaining(iso: string, now: number = Date.now()): string | null {
  const due = new Date(iso).getTime()
  if (Number.isNaN(due)) return null
  const left = due - now
  if (left <= 0) return null
  if (left >= DAY_MS) return `${Math.floor(left / DAY_MS)}일 남음`
  if (left >= HOUR_MS) return `${Math.floor(left / HOUR_MS)}시간 남음`
  return '1시간 이내'
}

// 목록 카드 행 제목 — 대표 상품명 + "외 N개"(대표 품목을 제외한 라인 수). 대표 품목이 없으면 '주문 상품'.
export function sellerOrderTitle(so: BuyerSellerOrder): string {
  const rep = so.representativeItem
  if (!rep) return '주문 상품'
  const rest = so.itemCount - 1
  return rest > 0 ? `${rep.name} 외 ${rest}개` : rep.name
}

/**
 * 클레임 내역 한 줄의 대상 품목 요약 — "상품명 (N개)" + "외 N개".
 * 수량 표기만 괄호를 쓰는 카피 규칙에 맞춘다(그 밖의 구분자는 `/`).
 * 서버가 상품명을 비워 보낼 수 있어 주문 품목에서 메우고, 그래도 없으면 품목 수만 알린다.
 *
 * **대상 품목을 모르는 경우(`items` 미제공)와 비어 있는 경우를 가른다** — 주문 상세의 `activeClaim`
 * 응답에는 품목이 아예 없어서(be OrderActiveClaimResponse) 내역이 도착하기 전 폴백으로 그릴 때
 * "주문 전체"라고 적으면 일부 품목만 신청한 건을 전체 신청으로 위장한다.
 */
export function claimTargetSummary(claim: BuyerOrderClaim, order: BuyerOrderDetail): string {
  const lines = claim.items
  if (lines == null) return '신청 상품은 내역을 불러온 뒤 확인할 수 있어요'
  if (lines.length === 0) return '주문 전체'
  const first = lines[0] as NonNullable<typeof lines>[number]
  const name =
    first.productName ??
    order.items.find(item => item.orderItemId === first.orderItemId)?.name ??
    null
  const head = name == null ? `품목 ${lines.length}개` : `${name} (${first.quantity}개)`
  const rest = lines.length - 1
  return rest > 0 ? `${head} 외 ${rest}개` : head
}

/**
 * 클레임 내역 한 줄의 최신 시각 — 종결됐으면 종결, 승인됐으면 승인, 아니면 요청 시각.
 * 세 값 모두 서버가 오프셋 없는 KST로 주고 어댑터가 오프셋을 붙여 넘긴 뒤라 절대 시각이다.
 */
export function claimTimelineAt(claim: BuyerOrderClaim): string | undefined {
  return claim.resolvedAt ?? claim.approvedAt ?? claim.requestedAt
}

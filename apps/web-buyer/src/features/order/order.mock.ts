import type { BuyerOrderItemStatus, BuyerOrderStatus, BuyerSellerOrder } from '@aechak/domain'
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

// 상태 세그먼트(전체/진행중/완료/취소). 서버 status 필터 매핑은 shared/order 어댑터가 맡는다.
export const ORDER_SEGMENTS: { value: OrderSegment; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'in-progress', label: '진행중' },
  { value: 'done', label: '완료' },
  { value: 'canceled', label: '취소' },
]

// 배송 시작 전(결제완료/상품준비중)만 취소 대상이다. 취소 API가 아직 없어 화면 진입은 막혀 있다.
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

// 목록 카드 행 제목 — 대표 상품명 + "외 N개"(대표 품목을 제외한 라인 수). 대표 품목이 없으면 '주문 상품'.
export function sellerOrderTitle(so: BuyerSellerOrder): string {
  const rep = so.representativeItem
  if (!rep) return '주문 상품'
  const rest = so.itemCount - 1
  return rest > 0 ? `${rep.name} 외 ${rest}개` : rep.name
}

import { useSyncExternalStore } from 'react'
import type { BuyerOrder } from '@aechak/domain'

// 구매자 주문 전역 스토어. 주문 목록/상세/취소/리뷰 화면이 모두 이 단일 소스를 본다 —
// 취소·구매확정 같은 상태 전이가 한 곳에서 일어나면 모든 화면에 즉시 반영된다.
// 찜/장바구니(shared/catalog·shared/cart)와 동일하게 서버 상태가 아니라 클라이언트 목업
// 상태이고, 새 의존성(zustand)을 끌어오지 않기 위해 React 내장 useSyncExternalStore로 구현했다.
// feature 간 직접 import는 금지라 여러 feature가 공유하는 주문 상태를 여기(shared)에 둔다.
//
// 이 스토어는 주문 스냅샷(BuyerOrder, 상품 정보 denormalize)만 들고 있어 shared/catalog에
// 의존하지 않는다(boundaries: shared → shared 금지). 결제 성공 시 카탈로그 정보로 주문을
// 만드는 조립 로직은 shared/catalog의 buildOrderFromContext가 담당하고, 여기 addOrder로 넣는다.

// 취소/구매확정 전이 시 찍는 목업 날짜(오늘 = 2026-07-10, 세션 고정값 — new Date() 미사용).
const TODAY = '2026.07.10'

// 시드 주문 6건 — paid/preparing/shipping/delivered/confirmed/cancelled 6개 상태를 모두 덮어
// 목록 세그먼트·상세 타임라인·취소 가능/불가·리뷰 CTA를 실제 데이터로 시연할 수 있게 한다.
const SEED_ORDERS: BuyerOrder[] = [
  {
    id: '20260710-0182',
    orderedAt: '2026.07.10 09:12',
    status: 'paid',
    method: 'kakaopay',
    groups: [
      {
        sellerId: 'seller-냥이상점',
        storeName: '냥이상점',
        shippingFee: 0,
        items: [
          {
            productId: 'p-feeder-5l',
            name: '고양이 자동 급식기 스마트 5L 앱 연동 타이머',
            option: '용량 5L / 화이트',
            quantity: 1,
            unitPrice: 64000,
          },
        ],
      },
    ],
    itemsTotal: 64000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 64000,
    pointsEarned: 640,
  },
  {
    id: '20260709-0155',
    orderedAt: '2026.07.09 20:47',
    status: 'preparing',
    method: 'card',
    groups: [
      {
        sellerId: 'seller-스마트펫',
        storeName: '스마트펫',
        shippingFee: 3000,
        items: [
          {
            productId: 'p-litter-85',
            name: '대용량 모래 8.5L 벤토나이트',
            option: '무향 / 8.5L',
            quantity: 2,
            unitPrice: 16000,
          },
        ],
      },
    ],
    itemsTotal: 32000,
    shippingTotal: 3000,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 35000,
    pointsEarned: 350,
  },
  {
    id: '20260707-0132',
    orderedAt: '2026.07.07 13:05',
    status: 'shipping',
    method: 'tosspay',
    groups: [
      {
        sellerId: 'seller-냥이상점',
        storeName: '냥이상점',
        shippingFee: 0,
        items: [
          {
            productId: 'p-churu',
            name: '츄르 참치맛 40개입',
            option: '참치맛 / 40개입',
            quantity: 3,
            unitPrice: 13900,
          },
        ],
      },
    ],
    itemsTotal: 41700,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 700,
    paidAmount: 41000,
    pointsEarned: 410,
    shipment: { courier: 'CJ대한통운', trackingNumber: '1234-5678-9012' },
    shippedAt: '2026.07.08',
  },
  {
    id: '20260703-0098',
    orderedAt: '2026.07.03 11:30',
    status: 'delivered',
    method: 'kakaopay',
    groups: [
      {
        sellerId: 'seller-멍멍마트',
        storeName: '멍멍마트',
        shippingFee: 0,
        items: [
          {
            productId: 'p-leash-5m',
            name: '자동 리드줄 5m 대형견용',
            option: '5m / 블랙',
            quantity: 1,
            unitPrice: 24000,
          },
          {
            productId: 'p-nose-toy',
            name: '노즈워크 담요 장난감',
            option: '기본 구성',
            quantity: 1,
            unitPrice: 18000,
          },
        ],
      },
    ],
    itemsTotal: 42000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 42000,
    pointsEarned: 420,
    shipment: { courier: '한진택배', trackingNumber: '9988-7766-5544' },
    shippedAt: '2026.07.04',
    deliveredAt: '2026.07.05',
    autoConfirmAt: '2026.07.12',
  },
  {
    id: '20260628-0071',
    orderedAt: '2026.06.28 08:22',
    status: 'confirmed',
    method: 'card',
    groups: [
      {
        sellerId: 'seller-코코펫',
        storeName: '코코펫',
        shippingFee: 0,
        items: [
          {
            productId: 'p-joint-90',
            name: '관절 영양제 코코넛맛 90정',
            option: '코코넛맛 / 90정',
            quantity: 1,
            unitPrice: 32000,
          },
        ],
      },
    ],
    itemsTotal: 32000,
    shippingTotal: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 32000,
    pointsEarned: 320,
    shipment: { courier: '롯데택배', trackingNumber: '4455-6677-8899' },
    shippedAt: '2026.06.29',
    deliveredAt: '2026.06.30',
    confirmedAt: '2026.07.02',
  },
  {
    id: '20260702-0090',
    orderedAt: '2026.07.02 15:44',
    status: 'cancelled',
    method: 'kakaopay',
    groups: [
      {
        sellerId: 'seller-멍멍마트',
        storeName: '멍멍마트',
        shippingFee: 3000,
        items: [
          {
            productId: 'p-scratcher',
            name: '스크래쳐 하우스 2종 세트',
            option: '2종 세트',
            quantity: 1,
            unitPrice: 29000,
          },
        ],
      },
    ],
    itemsTotal: 29000,
    shippingTotal: 3000,
    couponDiscount: 0,
    pointsUsed: 0,
    paidAmount: 32000,
    pointsEarned: 0,
    cancelledAt: '2026.07.02',
    refundedAt: '2026.07.03',
  },
]

let orders: readonly BuyerOrder[] = SEED_ORDERS
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): readonly BuyerOrder[] {
  return orders
}

/**
 * 주문을 추가한다(결제 성공 시). 같은 id면 교체(upsert)한다 —
 * React StrictMode에서 결제 mutation onSuccess가 이중 발화해도 주문번호가 결정적이라
 * 같은 id로 들어와 중복 주문이 생기지 않는다. 최신 주문이 목록 맨 앞에 오도록 앞에 넣는다.
 */
export function addOrder(order: BuyerOrder): void {
  const rest = orders.filter(o => o.id !== order.id)
  orders = [order, ...rest]
  emit()
}

/** 주문을 취소한다(배송 시작 전만 호출됨 — 화면에서 가드). 상태를 cancelled로 바꾸고 환불일을 찍는다. */
export function cancelOrder(id: string): void {
  orders = orders.map(o =>
    o.id === id ? { ...o, status: 'cancelled', cancelledAt: TODAY, refundedAt: TODAY } : o,
  )
  emit()
}

/** 구매확정한다(배송완료 주문만). 상태를 confirmed로 바꾸고 확정일을 찍는다. */
export function confirmOrder(id: string): void {
  orders = orders.map(o => (o.id === id ? { ...o, status: 'confirmed', confirmedAt: TODAY } : o))
  emit()
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetOrders(): void {
  orders = SEED_ORDERS
  emit()
}

/** 현재 주문 목록(비구독 스냅샷) — 테스트/비React 로직용. */
export function getOrders(): readonly BuyerOrder[] {
  return orders
}

/** 전체 주문 목록을 구독한다(최신순). */
export function useOrders(): readonly BuyerOrder[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

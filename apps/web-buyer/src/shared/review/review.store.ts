import { useSyncExternalStore } from 'react'
import type { Review } from '@aechak/domain'

// 구매자 리뷰 전역 스토어(내가 작성한 리뷰). 리뷰 작성(b4-st-2) 후 여기에 쌓이고,
// 내 리뷰(b4-st-6) "작성 완료" 탭과 상품 리뷰 목록(b4-st-3)에 즉시 반영된다.
// "작성 대기"(b4-st-6)는 배송완료/구매확정 주문 상품 중 이 스토어에 리뷰가 없는 것으로 파생한다.
// 찜/장바구니/주문과 동일하게 클라이언트 목업 상태라 useSyncExternalStore로 구현했다.

// 시드 리뷰 2건 — 내 리뷰 "작성 완료" 탭이 비지 않게, 또 이 상품의 b4-st-3 목록에
// 사용자 리뷰가 얹히는 걸 시연하기 위해 둔다. orderId는 주문 스토어에 없는 과거 주문이라
// "작성 대기" 파생에는 영향을 주지 않는다(작성 대기는 현재 주문 스토어의 배송완료 건에서만 계산).
const SEED_REVIEWS: Review[] = [
  {
    id: 'rv-seed-1',
    productId: 'p-feeder-5l',
    orderId: '20260620-0044',
    author: '나',
    rating: 5,
    content: '급식 시간이 정확하고 앱 알림이 편해요. 우리 집 고양이가 잘 적응했어요. 재구매 의사 있어요.',
    images: [],
    option: '용량 5L / 화이트',
    verifiedPurchase: true,
    createdAt: '2026.06.24',
  },
  {
    id: 'rv-seed-2',
    productId: 'p-churu',
    orderId: '20260622-0051',
    author: '나',
    rating: 4,
    content: '아이가 좋아해서 간식으로 자주 줘요. 양도 넉넉하고 배송도 빨랐어요.',
    images: [],
    option: '참치맛 / 40개입',
    verifiedPurchase: true,
    createdAt: '2026.06.25',
  },
]

let reviews: readonly Review[] = SEED_REVIEWS
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

function getSnapshot(): readonly Review[] {
  return reviews
}

/**
 * 리뷰를 추가한다(작성 완료). 같은 id면 교체(upsert)한다 — 리뷰 id를 주문 상품 단위로
 * 결정적으로 부여하므로(rv-<orderId>-<productId>), 같은 주문 상품에 두 번 등록해도 중복되지
 * 않는다. 최신 리뷰가 앞에 오도록 앞에 넣는다.
 */
export function addReview(review: Review): void {
  reviews = [review, ...reviews.filter(r => r.id !== review.id)]
  emit()
}

/** 리뷰를 수정한다(별점/본문/사진). 없으면 무시. */
export function updateReview(
  id: string,
  patch: Pick<Review, 'rating' | 'content' | 'images'>,
): void {
  reviews = reviews.map(r => (r.id === id ? { ...r, ...patch } : r))
  emit()
}

/** 리뷰를 삭제한다. */
export function removeReview(id: string): void {
  reviews = reviews.filter(r => r.id !== id)
  emit()
}

/** 특정 주문 상품에 이미 리뷰를 썼는지(작성 대기 판정용). */
export function hasReviewFor(orderId: string, productId: string): boolean {
  return reviews.some(r => r.orderId === orderId && r.productId === productId)
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetReviews(): void {
  reviews = SEED_REVIEWS
  emit()
}

/** 현재 리뷰 목록(비구독 스냅샷) — 테스트/비React 로직용. */
export function getReviews(): readonly Review[] {
  return reviews
}

/** 전체 리뷰 목록을 구독한다(최신순). */
export function useReviews(): readonly Review[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

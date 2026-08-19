import { useSyncExternalStore } from 'react'

// 찜(위시) 전역 스토어. 홈/카테고리/검색결과/상세/찜목록 어디서 하트를 눌러도 같은 상태를
// 공유하도록 앱 전역 1개 인스턴스로 둔다. 서버 찜 상태의 클라이언트 미러(하트 표시용 id 집합)다 —
// 상품 카드 응답(ProductSummaryResponse)의 isLiked(SCRUM-190)는 fetch 시점에 이 미러로 시드하고
// (wishlist.queries.ts의 hydrateLikedFromSummaries), 도메인 CatalogProduct는 의도적으로 isLiked를
// 담지 않으므로 화면 전반 하트 상태의 단일 원본으로 이 미러가 필요하다. 실제 상품 데이터는 TanStack
// Query가 소유하고 이 스토어는 id만 담는다. 서버 반영은 wishlist.queries.ts의 toggleWishlist가
// 낙관적으로 add/remove하면서 like/unlike를 발사한다. feature 간 직접 import 금지라 이 스토어를
// shared에 두고 각 feature가 읽는다.

let wished: ReadonlySet<string> = new Set()
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

function getSnapshot(): ReadonlySet<string> {
  return wished
}

export function isWished(id: string): boolean {
  return wished.has(id)
}

export function addWish(id: string): void {
  if (wished.has(id)) return
  const next = new Set(wished)
  next.add(id)
  wished = next
  emit()
}

export function removeWish(id: string): void {
  if (!wished.has(id)) return
  const next = new Set(wished)
  next.delete(id)
  wished = next
  emit()
}

/**
 * 서버에서 읽은 찜 id들을 미러에 union 머지한다(제거는 하지 않음 — 낙관적 해제분과 다른 페이지
 * id를 보존). 무한쿼리 페이지 로드처럼 데이터가 실제로 바뀌는 fetch 시점에만 호출할 것 — 매
 * 렌더마다 호출하면 방금 해제한 id를 다시 add해 카드가 되살아난다.
 */
export function hydrateWished(ids: readonly string[]): void {
  const next = new Set(wished)
  let changed = false
  for (const id of ids) {
    if (!next.has(id)) {
      next.add(id)
      changed = true
    }
  }
  if (!changed) return
  wished = next
  emit()
}

/** 로그아웃 시 미러를 비운다(공유 기기에서 다른 계정 하트가 남지 않게). */
export function clearWished(): void {
  if (wished.size === 0) return
  wished = new Set()
  emit()
}

/** 테스트 격리용 — 스토어를 빈 상태로 되돌린다. */
export function resetWishlist(): void {
  wished = new Set()
  emit()
}

/** 현재 찜한 상품 id 집합을 구독한다. 변경 시 리렌더된다. */
export function useWishedIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 특정 상품의 찜 여부를 구독한다. */
export function useIsWished(id: string): boolean {
  return useWishedIds().has(id)
}

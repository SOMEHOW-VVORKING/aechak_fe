import { useSyncExternalStore } from 'react'

// 찜(위시) 전역 스토어. 홈/카테고리/검색결과/상세/찜목록 어디서 하트를 눌러도 같은 상태를
// 공유하도록 앱 전역 1개 인스턴스로 둔다. 서버 상태가 아니라 순수 클라이언트 토글 상태이고
// 새 의존성(zustand)을 끌어오지 않기 위해 React 내장 useSyncExternalStore로 구현했다.
// feature 간 직접 import는 금지이므로 이 스토어를 shared에 두고 각 feature가 여기서 읽는다.

const SEED_IDS = ['p-feeder-5l', 'p-scratcher', 'p-joint-90', 'p-litter-85']

let wished: ReadonlySet<string> = new Set(SEED_IDS)
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

export function toggleWish(id: string): void {
  if (wished.has(id)) removeWish(id)
  else addWish(id)
}

/** 테스트 격리용 — 스토어를 시드 상태로 되돌린다. */
export function resetWishlist(): void {
  wished = new Set(SEED_IDS)
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

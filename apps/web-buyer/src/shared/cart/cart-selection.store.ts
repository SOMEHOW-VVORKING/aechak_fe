import { useSyncExternalStore } from 'react'

// 장바구니 "선택(체크)" 상태 전역 스토어. 장바구니 라인 자체는 서버가 소유하고(GET /carts),
// 서버에는 선택 개념이 없어 표시용 체크 상태만 클라이언트에 남는다. 새로 담긴 라인이 기본
// 선택이 되도록 선택 집합이 아니라 "해제된 cartItemId" 집합을 저장한다 — 서버에서 새 라인이
// 내려와도 집합에 없으면 곧 선택 상태다. 새로고침하면 전체 선택으로 돌아가는 순수 세션 상태.

let deselected: ReadonlySet<number> = new Set()
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

function getSnapshot(): ReadonlySet<number> {
  return deselected
}

/** 라인 하나의 선택 상태를 바꾼다. */
export function setCartItemSelected(cartItemId: number, selected: boolean): void {
  const next = new Set(deselected)
  if (selected) next.delete(cartItemId)
  else next.add(cartItemId)
  deselected = next
  emit()
}

/** 여러 라인의 선택 상태를 한 번에 바꾼다(전체 선택/해제, 셀러 그룹 선택). */
export function setCartItemsSelected(cartItemIds: number[], selected: boolean): void {
  const next = new Set(deselected)
  for (const id of cartItemIds) {
    if (selected) next.delete(id)
    else next.add(id)
  }
  deselected = next
  emit()
}

/** 테스트 격리용 — 전체 선택(빈 해제 집합) 상태로 되돌린다. */
export function resetCartSelection(): void {
  deselected = new Set()
  emit()
}

/** 해제된 cartItemId 집합(비구독 스냅샷). */
export function getDeselectedCartItemIds(): ReadonlySet<number> {
  return deselected
}

/** 해제된 cartItemId 집합을 구독한다. */
export function useDeselectedCartItemIds(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

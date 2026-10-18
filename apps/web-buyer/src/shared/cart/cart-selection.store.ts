import { useSyncExternalStore } from 'react'

// 장바구니 "선택(체크)" 상태. 라인은 서버(GET /carts)가 소유하고 서버엔 선택 개념이 없어 체크
// 상태만 클라이언트에 남는다. 새로 담긴 라인이 기본 선택이 되도록 "해제된 cartItemId" 집합을 들고,
// 새로고침·주문서 직접 진입에도 해제가 유지되도록 sessionStorage에 같이 적는다.

export const CART_SELECTION_STORAGE_KEY = 'aechak.cartDeselected'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** 저장된 해제 집합. 없거나 깨져 있으면 빈 집합. */
function loadDeselected(): ReadonlySet<number> {
  try {
    const raw = storage()?.getItem(CART_SELECTION_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is number => Number.isInteger(id)))
  } catch {
    return new Set()
  }
}

function persistDeselected(next: ReadonlySet<number>): void {
  try {
    const store = storage()
    if (!store) return
    if (next.size === 0) store.removeItem(CART_SELECTION_STORAGE_KEY)
    else store.setItem(CART_SELECTION_STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // 저장 실패(용량·프라이빗 모드)는 메모리 상태만으로 이어간다.
  }
}

let deselected: ReadonlySet<number> = loadDeselected()
const listeners = new Set<() => void>()

function commit(next: ReadonlySet<number>) {
  deselected = next
  persistDeselected(next)
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
  commit(next)
}

/** 여러 라인의 선택 상태를 한 번에 바꾼다(전체 선택/해제, 셀러 그룹 선택). */
export function setCartItemsSelected(cartItemIds: number[], selected: boolean): void {
  const next = new Set(deselected)
  for (const id of cartItemIds) {
    if (selected) next.delete(id)
    else next.add(id)
  }
  commit(next)
}

/** 라인이 다른 라인으로 병합됐을 때(PATCH merged=true) 해제 상태를 살아남은 id로 옮긴다. */
export function moveCartSelection(fromCartItemId: number, toCartItemId: number): void {
  if (fromCartItemId === toCartItemId || !deselected.has(fromCartItemId)) return
  const next = new Set(deselected)
  next.delete(fromCartItemId)
  next.add(toCartItemId)
  commit(next)
}

/** 전체 선택(빈 해제 집합) 상태로 되돌리고 저장소도 지운다 — 테스트 격리·로그아웃·계정 전환용. */
export function resetCartSelection(): void {
  commit(new Set())
}

/** 해제된 cartItemId 집합(비구독 스냅샷). */
export function getDeselectedCartItemIds(): ReadonlySet<number> {
  return deselected
}

/** 해제된 cartItemId 집합을 구독한다. */
export function useDeselectedCartItemIds(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

import { useSyncExternalStore } from 'react'
import { cartLineKey, type CartItem } from '@aechak/domain'

// 장바구니 전역 스토어. 상품 상세(담기)·앱바 배지·장바구니·주문서가 모두 이 단일 소스를 본다.
// 찜(wishlist.store)과 동일하게 서버 상태가 아니라 순수 클라이언트 상태이고, 새 의존성(zustand)을
// 끌어오지 않기 위해 React 내장 useSyncExternalStore로 구현했다.
//
// 이 스토어는 "장바구니 라인 원본"(productId/option/수량/선택)만 들고 있고, 상품 상세 정보 조회나
// 셀러 그룹핑·배송비 계산 같은 파생 로직은 상품 데이터가 필요하므로 shared/catalog의
// buildCartView가 담당한다 (shared → shared 교차 import 금지라 여기서 catalog를 import하지 않는다).
// 라인 키(cartLineKey)는 buildCartView와 규칙을 공유해야 해서 도메인에 두고 양쪽이 import한다.

// 초기 목업 장바구니(b1-st-3): 냥이상점 급식기(활성·선택) + 멍멍마트 스크래쳐(품절·미선택).
// 품절 상품은 buildCartView에서 선택 불가로 취급되므로 selected는 false로 시드한다.
const SEED_ITEMS: CartItem[] = [
  { productId: 'p-feeder-5l', option: '용량 5L / 화이트', quantity: 1, selected: true },
  { productId: 'p-scratcher', option: '기본', quantity: 1, selected: false },
]

let items: readonly CartItem[] = SEED_ITEMS
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

function getSnapshot(): readonly CartItem[] {
  return items
}

function keyOf(item: CartItem): string {
  return cartLineKey(item.productId, item.option)
}

/**
 * 장바구니에 담는다. 같은 productId+option 라인이 있으면 수량만 합친다(새 라인은 기본 선택).
 * 옵션 조합 추가금(additionalPrice)/조합 id는 새 라인에만 싣는다 — 같은 option 라인은 같은 조합이라
 * 추가금도 같으므로 기존 값을 유지한다.
 */
export function addToCart(
  productId: string,
  option: string,
  quantity = 1,
  additionalPrice?: number,
  optionCombinationId?: number,
): void {
  const key = cartLineKey(productId, option)
  const existing = items.find(i => keyOf(i) === key)
  if (existing) {
    items = items.map(i =>
      keyOf(i) === key ? { ...i, quantity: i.quantity + quantity } : i,
    )
  } else {
    items = [...items, { productId, option, quantity, selected: true, additionalPrice, optionCombinationId }]
  }
  emit()
}

/** 라인 하나를 삭제한다. */
export function removeFromCart(key: string): void {
  items = items.filter(i => keyOf(i) !== key)
  emit()
}

/**
 * 여러 라인을 한 번에 삭제한다(선택 삭제, 결제 성공 후 주문된 라인 제거).
 * 결제 성공 후엔 raw `selected` 플래그가 아니라 실제 주문된(뷰 기준 선택 가능+선택) 라인 키만
 * 넘겨야 한다 — 품절 라인은 raw selected가 true여도 주문 대상이 아니므로 지우면 안 된다.
 */
export function removeManyFromCart(keys: string[]): void {
  const set = new Set(keys)
  items = items.filter(i => !set.has(keyOf(i)))
  emit()
}

/** 라인 수량을 변경한다(최소 1). */
export function setCartQuantity(key: string, quantity: number): void {
  const next = Math.max(1, Math.round(quantity))
  items = items.map(i => (keyOf(i) === key ? { ...i, quantity: next } : i))
  emit()
}

/** 라인 하나의 선택 상태를 바꾼다. */
export function setCartSelected(key: string, selected: boolean): void {
  items = items.map(i => (keyOf(i) === key ? { ...i, selected } : i))
  emit()
}

/**
 * 여러 라인의 선택 상태를 한 번에 바꾼다(전체 선택/해제).
 * `keys`를 주면 그 라인들만, 없으면 전체 라인에 적용한다 — 품절(선택 불가) 라인을 빼고
 * 선택하려면 호출부가 선택 가능한 키 목록을 넘긴다.
 */
export function setAllCartSelected(selected: boolean, keys?: string[]): void {
  const set = keys ? new Set(keys) : null
  items = items.map(i => (set == null || set.has(keyOf(i)) ? { ...i, selected } : i))
  emit()
}

/** 장바구니를 비운다. */
export function clearCart(): void {
  items = []
  emit()
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetCart(): void {
  items = SEED_ITEMS
  emit()
}

/** 현재 장바구니 라인 목록(비구독 스냅샷) — 테스트/비React 로직용. */
export function getCartItems(): readonly CartItem[] {
  return items
}

/** 현재 장바구니 라인 목록을 구독한다. */
export function useCartItems(): readonly CartItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 앱바 배지용 — 담긴 전체 수량 합계를 구독한다. */
export function useCartCount(): number {
  const list = useCartItems()
  return list.reduce((sum, i) => sum + i.quantity, 0)
}

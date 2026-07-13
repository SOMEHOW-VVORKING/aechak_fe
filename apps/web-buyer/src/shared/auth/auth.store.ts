import { useSyncExternalStore } from 'react'

// 로그인 여부 전역 mock 스토어. 비회원 로그인 유도 게이트(b13-st-2)와 설정 홈 로그아웃
// (b11-st-1)이 같은 상태를 공유하도록 앱 전역 1개 인스턴스로 둔다. 실제 인증은 범위 밖이라
// 순수 클라이언트 플래그이며, 찜/장바구니와 동일하게 새 의존성(zustand) 없이 React 내장
// useSyncExternalStore로 구현했다.
//
// 기본값은 "로그인됨"이다 — 기존 Phase 1~3 화면(찜/장바구니/주문)이 회원 흐름을 전제로
// 동작하기 때문. 게이트는 설정 홈에서 로그아웃해 비회원이 된 뒤 찜/구매를 시도하면 뜬다
// (새로고침하면 다시 로그인 상태로 리셋되는 순수 세션 상태).

let loggedIn = true
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

function getSnapshot(): boolean {
  return loggedIn
}

/** 현재 로그인 여부(비구독 스냅샷) — 이벤트 시점 분기(requireAuth)나 테스트에 쓴다. */
export function getIsLoggedIn(): boolean {
  return loggedIn
}

export function login(): void {
  if (loggedIn) return
  loggedIn = true
  emit()
}

export function logout(): void {
  if (!loggedIn) return
  loggedIn = false
  emit()
}

/** 테스트 격리용 — 기본(로그인) 상태로 되돌린다. */
export function resetAuth(): void {
  loggedIn = true
  emit()
}

/** 로그인 여부를 구독한다. 변경 시 리렌더된다. */
export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

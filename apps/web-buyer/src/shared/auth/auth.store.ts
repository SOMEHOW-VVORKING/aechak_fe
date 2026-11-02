import { useSyncExternalStore } from 'react'
import { getAccessToken, setAccessToken, subscribeAccessToken } from '@aechak/api'

// 로그인 여부 전역 스토어. 비회원 로그인 유도 게이트(b13-st-2)와 설정 홈 로그아웃(b11-st-1)이 같은
// 상태를 공유하도록 앱 전역 1개 인스턴스로 두고, 찜/장바구니와 동일하게 새 의존성(zustand) 없이
// React 내장 useSyncExternalStore로 구현했다.
//
// 상태의 정본은 @aechak/api 의 access 토큰이다 — 이 스토어는 그 값을 미러링한다. 별도 플래그를
// 들고 있으면 refresh 성공·세션 만료·로그아웃마다 두 값이 갈려, 토큰이 없는데 "로그인됨"으로
// 보이는 거짓 상태가 만들어진다.
//
// 상태가 셋인 이유: access 토큰은 메모리에만 있어서 새로고침·공유 링크 진입에서는 비어 있고,
// refresh 쿠키는 httpOnly라 JS가 읽을 수 없다. 그래서 refresh를 한 번 쏴 보기 전에는 회원인지
// 비회원인지 알 수 없다 — 그 "아직 모름"이 'unknown'이고, auth.session의 restoreSessionOrGuest가
// 한 번만 확인해 'member' 또는 'guest'로 확정한다.
export type SessionState = 'unknown' | 'member' | 'guest'

function stateFromToken(): SessionState {
  return getAccessToken() == null ? 'unknown' : 'member'
}

let state: SessionState = stateFromToken()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setState(next: SessionState) {
  if (state === next) return
  state = next
  emit()
}

// 토큰이 움직이면 그대로 따라간다. 토큰이 생기면 회원이다.
//
// 비워지는 쪽은 'guest'가 아니라 'unknown'이다 — client.ts의 401 인터셉터는 refresh가 5xx나
// 네트워크로 실패해도 토큰을 버리므로, 비우는 것만으로는 "세션이 없다"와 "지금 확인에 실패했다"를
// 가를 수 없다. 멀쩡한 refresh 쿠키를 들고 있는 회원을 일시 장애 한 번으로 비회원으로 못 박으면
// 회원 전용 화면이 "로그인이 필요해요"라고 거짓을 말한다. 'unknown'으로 두면 다음 네비게이션에서
// 다시 확인해 스스로 복구된다. 비회원 확정은 401을 실제로 본 쪽(logout)만 한다.
subscribeAccessToken(token => setState(token == null ? 'unknown' : 'member'))

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): SessionState {
  return state
}

/** 세션 확인 단계까지 포함한 현재 상태(비구독 스냅샷) — 라우트 가드가 'unknown'과 'guest'를 가른다. */
export function getSessionState(): SessionState {
  return state
}

/**
 * 현재 로그인 여부(비구독 스냅샷) — 이벤트 시점 분기(requireAuth)나 테스트에 쓴다.
 * 'unknown'은 아직 회원이 아니므로 false다: 확인 전에 회원 전용 API를 부르면 401로 튕긴다.
 */
export function getIsLoggedIn(): boolean {
  return state === 'member'
}

/** 로그인 완료(/login/complete)가 토큰 수령 뒤 부른다. 토큰 구독으로 이미 member지만 명시해 둔다. */
export function login(): void {
  setState('member')
}

/** 비회원으로 확정한다. 토큰도 함께 버려 "플래그는 비회원인데 토큰은 남아 있는" 상태를 막는다. */
export function logout(): void {
  setAccessToken(null)
  setState('guest')
}

/** 테스트 격리용 — 토큰을 버리고 확인 전(unknown) 상태로 되돌린다. */
export function resetAuth(): void {
  setAccessToken(null)
  setState('unknown')
}

/** 세션 상태를 구독한다. 변경 시 리렌더된다. */
export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 로그인 여부를 구독한다. 변경 시 리렌더된다. */
export function useIsLoggedIn(): boolean {
  return useSessionState() === 'member'
}

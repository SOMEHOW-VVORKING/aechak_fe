import { API_PATH_PREFIX } from '@aechak/api'

// MSW 핸들러 모듈이 공유하는 호스트·에러 봉투. `server.ts`가 이 값을 그대로 다시 내보내므로
// 기존 import 자리(`@/testing/msw/server`)는 바뀌지 않는다.
//
// 호스트를 둘로 나눠 둔 이유는 server.ts 머리글에 적혀 있다 — 한 base로 합치면 요청이 엉뚱한
// 모듈로 나가도 MSW가 똑같이 받아 주어 호스트 오배치를 테스트가 놓친다.
export const API_ORIGIN = 'http://localhost:8080'
export const ADMIN_ORIGIN = 'http://localhost:8082'
export const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
export const adminBase = `${ADMIN_ORIGIN}${API_PATH_PREFIX}`

/** BE ApiResponse의 에러 봉투 모양. 화면의 에러 매핑이 errorCode로 갈라지므로 둘 다 싣는다. */
export const errorBody = (errorCode: number, message: string) => ({ errorCode, message })

/** 커서 base64url 인코딩 — 서버와 같은 모양으로 만들어 FE가 값을 들여다보지 않는지도 고정한다. */
export const encodeCursorPayload = (payload: string): string =>
  btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function decodeCursorPayload(raw: string): string | null {
  try {
    return atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }
}

/** size 파라미터 절삭 — 서버가 1~100으로 자르는 경로(문의·클레임)가 쓴다. */
export function clampSize(raw: string | null, fallback = 20): number {
  if (raw == null) return fallback
  const parsed = Math.trunc(Number(raw))
  if (!Number.isFinite(parsed) || parsed === 0) return 1
  return Math.min(100, Math.max(1, parsed))
}

import { API_PATH_PREFIX } from '@aechak/api'

// MSW 핸들러 모듈이 공유하는 호스트·에러 봉투. `server.ts`가 이 값을 그대로 다시 내보내므로
// 기존 import 자리(`@/testing/msw/server`)는 바뀌지 않는다(web-admin msw/base.ts 관례).
//
// 호스트를 둘로 나눠 둔 이유는 server.ts 머리글에 적혀 있다 — 한 base로 합치면 요청이 엉뚱한
// 모듈로 나가도 MSW가 똑같이 받아 주어 호스트 오배치를 테스트가 놓친다. 두 상수는 test-setup.ts의
// configureApiHosts 인자와 같은 값이어야 한다.
export const API_ORIGIN = 'http://localhost:8080'
export const SELLER_ORIGIN = 'http://localhost:8081'
export const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
export const sellerBase = `${SELLER_ORIGIN}${API_PATH_PREFIX}`

/** BE ApiResponse의 에러 봉투 모양. 화면의 에러 매핑이 errorCode로 갈라지므로 둘 다 싣는다. */
export const errorBody = (errorCode: number, message: string) => ({ errorCode, message })

/**
 * 커서 base64url 인코딩 — 서버와 같은 모양으로 만들어 FE가 값을 들여다보지 않는지도 고정한다.
 *
 * **UTF-8 바이트를 거쳐 인코딩한다.** `btoa`는 latin1 밖의 코드포인트에 `InvalidCharacterError`를
 * 던지므로 payload에 한글이 섞이면 핸들러가 그 자리에서 죽는다 — 서버는
 * `Base64.getUrlEncoder().encodeToString(payload.getBytes(UTF_8))`이다.
 */
export const encodeCursorPayload = (payload: string): string => {
  const bytes = new TextEncoder().encode(payload)
  let latin1 = ''
  for (const byte of bytes) latin1 += String.fromCharCode(byte)
  return btoa(latin1).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 깨진 커서는 `null`이다 — 핸들러가 그 자리에서 400(90002)으로 끊는다. */
export function decodeCursorPayload(raw: string): string | null {
  try {
    const latin1 = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(latin1, char => char.charCodeAt(0))
    // fatal — UTF-8이 아닌 바이트열을 U+FFFD로 덮어 되살리면 깨진 커서가 조용히 통과한다.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** size 파라미터 절삭 — 서버가 1~100으로 자르는 경로가 쓴다(범위를 벗어나도 400이 아니다). */
export function clampSize(raw: string | null, fallback = 20): number {
  if (raw == null) return fallback
  const parsed = Math.trunc(Number(raw))
  if (!Number.isFinite(parsed) || parsed === 0) return 1
  return Math.min(100, Math.max(1, parsed))
}

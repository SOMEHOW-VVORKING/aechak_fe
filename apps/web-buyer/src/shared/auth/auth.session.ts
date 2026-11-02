import { axiosInstance, errorResponse, restoreSession, setAccessToken } from '@aechak/api'
import { getSessionState, login, logout } from './auth.store'

// 서버 세션 종료(POST /auth/web/logout) — 설정 홈 로그아웃의 서버 배선(SCRUM-92).
// 서버 계약: permitAll + refresh 쿠키 기반이라 Authorization이 필요 없고, 쿠키가 없거나 이미
// 폐기된 토큰이어도 조용히 204를 주는 완전 멱등 EP다(Set-Cookie로 refresh 쿠키 만료).
// 경로가 /auth/로 시작해 401 refresh 재시도 인터셉터도 타지 않는다.
export async function endServerSession(): Promise<void> {
  try {
    await axiosInstance.post('/auth/web/logout')
  } catch {
    // 네트워크 단절 등 전송 실패가 로컬 로그아웃을 막으면 안 된다 — 서버 RT는 TTL(7d)로
    // 소멸하고, 아래에서 access 토큰을 파기하므로 이 기기에서는 즉시 로그아웃된 상태가 된다.
  } finally {
    setAccessToken(null)
  }
}

/**
 * 세션을 한 번 확인해 'unknown'을 'member' 또는 'guest'로 확정한다. 모든 라우트가 렌더 전에
 * 이것을 거친다(__root beforeLoad).
 *
 * access는 메모리에만 있어 새로고침이나 공유 링크로 들어오면 비어 있고, refresh 쿠키는 httpOnly라
 * JS가 읽을 수 없다. 그래서 refresh를 한 번 쏴 보는 것만이 회원 여부를 아는 방법이다. 쿠키가
 * 없으면(401) 로그인 화면으로 보내지 않고 비회원으로 확정해 게스트 카탈로그를 그대로 보여준다.
 * 네트워크/5xx는 세션 유무를 모르니 'unknown'으로 남겨 다음 네비게이션에서 다시 확인한다.
 *
 * 확정된 뒤에는 요청을 보내지 않는다 — refresh 쿠키는 호출마다 회전하므로 불필요한 재확인이
 * 멀쩡한 세션을 흔든다. 동시 호출은 client.ts의 공유 refreshPromise가 한 번으로 합친다.
 */
export async function restoreSessionOrGuest(): Promise<void> {
  if (getSessionState() !== 'unknown') return
  try {
    await restoreSession()
    login()
  } catch (error) {
    // refresh 401(쿠키 없음/만료 20002, 재사용 20003) = 세션 없음 → 비회원 확정.
    if (errorResponse(error)?.status === 401) logout()
  }
}

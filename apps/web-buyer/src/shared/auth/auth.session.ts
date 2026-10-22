import { axiosInstance, errorResponse, getAccessToken, restoreSession, setAccessToken } from '@aechak/api'
import { getIsLoggedIn, logout } from './auth.store'

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

// 비로그인도 열리는 라우트(SNS 프로필 등)의 세션 확인. access는 메모리에만 있어 새로고침이나 공유 링크로 들어오면
// 비어 있고, 토큰 선택 API는 401 없이 비로그인 응답을 주므로 인터셉터의 refresh도 돌지 않는다. 그래서 요청 전에
// refresh 쿠키로 세션을 먼저 복원한다. 쿠키가 없으면(401) 로그인 화면으로 보내지 않고 비로그인으로 이어 간다.
// 네트워크/5xx는 세션 유무를 모르니 그대로 둔다(_tabs/index.tsx와 같은 판단).
export async function restoreSessionOrGuest(): Promise<void> {
  if (!getIsLoggedIn() || getAccessToken()) return
  try {
    await restoreSession()
  } catch (error) {
    if (errorResponse(error)?.status === 401) logout()
  }
}

import { axiosInstance, setAccessToken } from '@aechak/api'

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

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

// 루트 게이트가 세션 확인을 기다리는 상한. axios에 timeout이 없어서 이 상한이 없으면 refresh 한
// 건이 응답하지 않는 동안 앱 전체가 빈 화면이 된다 — BE가 permitAll로 열어 둔 공개 카탈로그까지
// 인증 서버 응답을 기다리게 되므로, 기다림을 끊고 먼저 그린다(확인은 백그라운드에서 계속된다).
const SESSION_GATE_TIMEOUT_MS = 1500

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
 * 멀쩡한 세션을 흔든다. 동시 호출은 client.ts의 공유 refreshPromise가 한 번으로 합친다(상한에
 * 걸려 다음 네비게이션에서 다시 불려도 진행 중인 요청에 합류하므로 쿠키가 또 회전하지 않는다).
 */
export async function restoreSessionOrGuest(): Promise<void> {
  if (getSessionState() !== 'unknown') return
  // 확정은 백그라운드로 계속 둔다 — 아래 상한에 걸려 먼저 렌더해도, 응답이 오면 상태가 올라가고
  // 화면이 다시 그려진다. 이 체인은 reject하지 않는다(두 갈래 다 받는다).
  const confirmed = restoreSession().then(
    () => login(),
    // refresh 401(쿠키 없음/만료 20002, 재사용 20003) = 세션 없음 → 비회원 확정.
    (error: unknown) => {
      if (errorResponse(error)?.status === 401) logout()
    },
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const bound = new Promise<void>(resolve => {
    timer = setTimeout(resolve, SESSION_GATE_TIMEOUT_MS)
  })
  try {
    await Promise.race([confirmed, bound])
  } finally {
    clearTimeout(timer)
  }
}

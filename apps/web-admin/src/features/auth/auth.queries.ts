import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { setAccessToken } from '@aechak/api'
import { endServerSession, loginWithPassword } from './auth.session'

/**
 * 로그아웃 — 서버 세션 종료가 성공한 뒤에만 로컬을 정리한다.
 *
 * 정리와 이동을 호출부 `mutate` 콜백이 아니라 훅에 두는 이유는 응답 전에 화면이 언마운트되면
 * 호출부 콜백이 버려지기 때문이다(web-buyer `useLogout`과 같은 이유).
 *
 * 실패에서는 **아무것도 비우지 않는다.** access를 비우면 refresh 쿠키가 살아 있는 채로 다음
 * 요청이 세션을 되살려 "로그아웃한 것 같은데 같은 계정"이 되고, 그게 데모에서 가장 헷갈린다.
 * 실패는 그대로 두고 화면이 재시도를 권한다.
 *
 * 알려진 한계(이 묶음 범위 밖): 업무 요청의 401로 **진행 중인** refresh가 로그아웃 204 뒤에
 * 응답하면 공유 클라이언트의 401 인터셉터가 `setAccessToken(newToken)`으로 토큰을 되살린다
 * (`packages/api/src/client.ts` — refresh Promise는 모듈 스코프라 여기서 취소할 수 없다).
 * 막으려면 세션 세대 표식이 그 파일에 필요한데, 세 앱이 공유하는 세션·토큰 정책이라 이 묶음에서
 * 손대지 않았다. 창은 좁다 — 서버가 revoke 전에 refresh를 처리하고 그 응답만 늦게 와야 한다
 * (revoke 뒤에 닿은 refresh는 401이고, 그 경로는 인터셉터가 토큰을 비운다).
 */
/**
 * 아이디·비밀번호 로그인. 성공하면 운영 화면으로 보낸다 — 소셜은 서버 콜백이 `/login/complete`로
 * 되돌려 그 라우트가 이동을 맡지만, 이쪽은 되돌아올 곳이 없어 훅이 직접 옮긴다.
 *
 * 실패는 삼키지 않고 호출부가 화면에 보여 준다. 서버가 아이디 부재와 비밀번호 불일치를 같은
 * 코드(20014)로 주므로 둘을 가려 안내할 수 없고, 가려 보여 주면 그 차이가 공격자에게 신호가 된다.
 */
export function usePasswordLogin() {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: ({ loginId, password }: { loginId: string; password: string }) =>
      loginWithPassword(loginId, password),
    onSuccess: async () => {
      await navigate({ to: '/' })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: endServerSession,
    onSuccess: async () => {
      setAccessToken(null)
      // 먼저 로그인 화면으로 옮기고 **그 뒤에** 캐시를 비운다. 순서가 뒤집히면 아직 마운트된
      // 운영 화면의 쿼리들이 비워진 자리를 즉시 다시 채워(관찰자가 살아 있다) 이전 계정의
      // 목록이 캐시에 남고, 토큰 없는 재조회가 쓸데없는 401 한 쌍까지 만든다.
      await navigate({ to: '/login' })
      queryClient.clear()
    },
  })
}

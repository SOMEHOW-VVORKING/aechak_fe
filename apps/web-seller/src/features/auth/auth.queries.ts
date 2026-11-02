import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { setAccessToken } from '@aechak/api'
import { endServerSession } from './auth.session'

/**
 * 로그아웃 — 서버 세션 종료가 성공한 뒤에만 로컬을 정리한다.
 *
 * 정리와 이동을 호출부 `mutate` 콜백이 아니라 훅에 두는 이유는 응답 전에 화면이 언마운트되면
 * 호출부 콜백이 버려지기 때문이다(web-buyer `useLogout`과 같은 이유).
 *
 * 실패에서는 **아무것도 비우지 않는다.** access를 비우면 refresh 쿠키가 살아 있는 채로 가드가
 * 세션을 복원해 "로그아웃한 것 같은데 같은 계정"이라는 상태가 되고, 그게 데모에서 가장 헷갈린다.
 * 실패는 그대로 두고 화면이 재시도를 권한다.
 */
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

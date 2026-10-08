import { useMutation, useQueryClient } from '@tanstack/react-query'
import { endServerSession, logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { resetReviews } from '@/shared/review'

/**
 * 로그아웃(POST /auth/web/logout). 서버 세션 종료(RT 무효화 + 쿠키 만료 + access 파기)를 먼저 하고
 * 로컬 상태를 정리한다. endServerSession은 전송 실패를 삼키므로(멱등 204 계약) onSettled 한 곳에서
 * 마무리한다. 정리를 호출부 mutate 콜백이 아니라 여기 두는 이유는 응답 전에 화면을 떠나면 호출부 콜백은
 * 실행되지 않기 때문이다(useWithdraw와 같은 이유). 화면은 Modal 닫기·이동만 맡는다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: endServerSession,
    onSettled: () => {
      logout()
      // 찜 미러/진행중 동기화/쿼리 캐시를 원자적으로 정리(공유 기기·재진입 대비)
      onWishlistLogout(queryClient)
      // 내가 쓴 리뷰는 서버 캐시가 아니라 클라이언트 스토어 싱글턴이라 queryClient.clear()로는
      // 안 지워진다 — 공유 기기에서 다음 사용자가 /reviews/mine에 들어가면 그대로 보인다.
      resetReviews()
      // 계정 단위 서버 캐시(내 정보/적립금/펫 등)가 다음 사용자에게 새지 않게 전부 비운다.
      queryClient.clear()
    },
  })
}

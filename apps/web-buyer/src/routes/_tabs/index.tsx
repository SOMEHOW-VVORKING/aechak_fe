import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAccessToken, restoreSession } from '@aechak/api'
import { HomeScreen } from '@/features/home'
import { getIsLoggedIn, logout } from '@/shared/auth'

// 홈은 회원 전용(GET /home 비로그인 401)이라 비회원 화면을 두지 않고 로그인을 먼저 거친다.
// - 로그아웃 상태: 요청 없이 바로 로그인 화면으로.
// - 메모리 access 없음(새로고침/첫 진입): refresh 쿠키로 세션을 먼저 복원한다. 실패한 /home 요청과
//   전역 401 리다이렉트를 거치지 않고, 쿠키가 살아 있는 회원은 그대로 홈을 본다.
// beforeLoad라 네비게이션당 1회 실행되고 StrictMode 이중 마운트 영향이 없다(/login/complete와 같은 결).
export const Route = createFileRoute('/_tabs/')({
  beforeLoad: async () => {
    if (!getIsLoggedIn()) throw redirect({ to: '/onboarding/login', replace: true })
    if (getAccessToken()) return
    try {
      await restoreSession()
    } catch (error) {
      // refresh 401(쿠키 없음/만료 20002, 재사용 20003) = 세션 없음 → 로그인.
      // 네트워크/5xx는 세션 유무를 모르니 화면에 맡긴다(/home 결과에 따라 인라인 오류나 전역 401 처리).
      if ((error as { response?: { status?: number } } | null)?.response?.status === 401) {
        logout()
        throw redirect({ to: '/onboarding/login', replace: true })
      }
    }
  },
  component: HomeScreen,
})

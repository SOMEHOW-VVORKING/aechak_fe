import { createFileRoute, redirect } from '@tanstack/react-router'
import { HomeScreen } from '@/features/home'
import { getSessionState } from '@/shared/auth'

// 홈은 회원 전용(GET /home 비로그인 401)이라 비회원 화면을 두지 않고 로그인을 먼저 거친다.
// 세션 확인은 __root beforeLoad가 이미 끝냈으므로 여기서는 결론만 읽는다 — 비회원으로 확정된
// 경우에만 로그인으로 보낸다. 'unknown'(네트워크/5xx로 확인 실패)은 세션 유무를 모르니 화면에
// 맡긴다(/home 결과에 따라 인라인 오류나 전역 401 처리).
export const Route = createFileRoute('/_tabs/')({
  beforeLoad: () => {
    if (getSessionState() === 'guest') throw redirect({ to: '/onboarding/login', replace: true })
  },
  component: HomeScreen,
})

import { createFileRoute, redirect } from '@tanstack/react-router'
import { MobileScreen } from '@aechak/design-system/web'
import { bootstrapSession } from '@/features/onboarding'
import { clearPendingAction, login, resumeReturnPath } from '@/shared/auth'

// 서버 콜백 로그인의 복귀 라우트 — 이 주소는 서버의 return 화이트리스트에 등록되어 있다.
// 성공: ?status=&isNew= 쿼리 + refresh 쿠키(httpOnly). access는 쿼리로 오지 않으므로
//       여기서 refresh를 호출해 수령한다(새로고침 세션 복원과 동일 호출).
// 실패: ?error={서버 에러코드} — 로그인 화면으로 되돌려 보낸다.
//
// 처리는 컴포넌트 이펙트가 아니라 beforeLoad에서 한다: 네비게이션당 정확히 1회 실행되고,
// StrictMode 이중 마운트(폐기되는 첫 마운트에서 쏜 요청의 결과 유실)의 영향을 받지 않는다.
export interface LoginCompleteSearch {
  status?: string
  isNew?: boolean
  error?: number
}

export const Route = createFileRoute('/login/complete')({
  validateSearch: (search: Record<string, unknown>): LoginCompleteSearch => {
    const error = Number(search['error'])
    return {
      status: typeof search['status'] === 'string' ? search['status'] : undefined,
      isNew: search['isNew'] === true || search['isNew'] === 'true',
      error: Number.isFinite(error) && error > 0 ? error : undefined,
    }
  },
  beforeLoad: async ({ search }) => {
    // 실패하면 로그인 뒤 다시 실행할 행동(A26)을 버린다. 다시 로그인해도 예전 행동이 실행되지 않게 한다.
    if (search.error !== undefined) {
      clearPendingAction()
      throw redirect({ to: '/onboarding/login', search: { error: search.error }, replace: true })
    }
    try {
      await bootstrapSession()
    } catch {
      // 쿠키 부재·만료 등 — 처음부터 다시 (20002 = 유효하지 않은 토큰)
      clearPendingAction()
      throw redirect({ to: '/onboarding/login', search: { error: 20002 }, replace: true })
    }
    login()
    // 신규 사용자는 SNS 요청이 403 20006이라 대기 행동을 온보딩(닉네임)을 마친 뒤 꺼낸다.
    if (search.status === 'PENDING_ONBOARDING') {
      throw redirect({ to: '/onboarding/terms', replace: true })
    }
    const returnTo = resumeReturnPath()
    if (returnTo) throw redirect({ href: returnTo, replace: true })
    throw redirect({ to: '/', replace: true })
  },
  component: LoginCompleteRoute,
})

// beforeLoad가 모든 경로에서 redirect를 던지므로 실제로는 거의 렌더되지 않는 대기 화면
function LoginCompleteRoute() {
  return (
    <MobileScreen contentClassName="flex items-center justify-center">
      <p className="text-body text-text-secondary">로그인 처리 중…</p>
    </MobileScreen>
  )
}

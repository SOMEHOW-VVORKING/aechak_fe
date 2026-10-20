import { createFileRoute, redirect } from '@tanstack/react-router'
import { bootstrapSession } from '@/features/auth'

// 서버 콜백 로그인의 복귀 라우트 — 이 주소는 서버의 return 화이트리스트에 등록되어 있다
// (local: http://localhost:5174/login/complete). 성공: ?status=&isNew= 쿼리 + refresh 쿠키.
// access는 쿼리로 오지 않으므로 여기서 refresh를 호출해 수령한다. 실패: ?error={서버 에러코드}.
//
// 처리는 컴포넌트 이펙트가 아니라 beforeLoad에서 한다 — 네비게이션당 정확히 1회 실행되고
// StrictMode 이중 마운트의 영향을 받지 않는다(web-seller·web-buyer /login/complete 관례).
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
    if (search.error !== undefined) {
      throw redirect({ to: '/login', search: { error: search.error }, replace: true })
    }
    try {
      await bootstrapSession()
    } catch {
      // 쿠키 부재·만료 등 — 처음부터 다시 (20002 = 유효하지 않은 토큰)
      throw redirect({ to: '/login', search: { error: 20002 }, replace: true })
    }
    if (search.status === 'PENDING_ONBOARDING') {
      // 어드민에는 온보딩 화면이 없고(온보딩 개념 자체가 없다) 온보딩 미완 계정은 ADMIN으로 승격되지
      // 않는다(승격이 409 errorCode 30017) — 로그인 화면에서 관리자 계정으로 다시 들어오라고 안내한다.
      throw redirect({ to: '/login', search: { error: 20006 }, replace: true })
    }
    throw redirect({ to: '/', replace: true })
  },
  component: LoginCompleteRoute,
})

// beforeLoad가 모든 경로에서 redirect를 던지므로 실제로는 거의 렌더되지 않는 대기 화면
function LoginCompleteRoute() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-sunken">
      <p className="text-body text-text-secondary">로그인 처리 중…</p>
    </div>
  )
}

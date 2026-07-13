import { useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MobileScreen } from '@aechak/design-system/web'
import { useTokenBootstrap } from '@/features/onboarding'
import { login } from '@/shared/auth'

// 서버 콜백 로그인의 복귀 라우트 — 이 주소는 서버의 return 화이트리스트에 등록되어 있다.
// 성공: ?status=&isNew= 쿼리 + refresh 쿠키(httpOnly). access는 쿼리로 오지 않으므로
//       여기서 /auth/web/refresh를 호출해 수령한다(새로고침 세션 복원과 동일 호출).
// 실패: ?error={서버 에러코드} — 로그인 화면으로 되돌려 보낸다.
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
  component: LoginCompleteRoute,
})

function LoginCompleteRoute() {
  const navigate = useNavigate()
  const { status, error } = Route.useSearch()
  const bootstrap = useTokenBootstrap()
  const startedRef = useRef(false)

  useEffect(() => {
    // StrictMode 이중 실행 가드 — refresh는 회전이라 중복 호출을 피한다(서버 유예로 흡수는 되지만 불필요).
    if (startedRef.current) return
    startedRef.current = true

    if (error !== undefined) {
      navigate({ to: '/onboarding/login', search: { error }, replace: true })
      return
    }
    bootstrap.mutate(undefined, {
      onSuccess: () => {
        login()
        if (status === 'PENDING_ONBOARDING') {
          navigate({ to: '/onboarding/terms', replace: true })
        } else {
          navigate({ to: '/', replace: true })
        }
      },
      // 쿠키 부재·만료 등 — 처음부터 다시 (20003 = 유효하지 않은 토큰)
      onError: () => navigate({ to: '/onboarding/login', search: { error: 20003 }, replace: true }),
    })
  }, [bootstrap, error, navigate, status])

  return (
    <MobileScreen contentClassName="flex items-center justify-center">
      <p className="text-body text-text-secondary">로그인 처리 중…</p>
    </MobileScreen>
  )
}

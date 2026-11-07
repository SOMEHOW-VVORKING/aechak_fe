import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  LoginForm,
  loginErrorMessage,
  socialLoginRedirectUrl,
  usePasswordLogin,
  type SocialProvider,
} from '@/features/auth'

export interface LoginSearch {
  /** 로그인 실패 시 /login/complete가 되돌려주는 서버 에러코드 */
  error?: number
}

export const Route = createFileRoute('/login/')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const error = Number(search['error'])
    return Number.isFinite(error) && error > 0 ? { error } : {}
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { error } = Route.useSearch()
  const [redirecting, setRedirecting] = useState<SocialProvider | null>(null)
  const passwordLogin = usePasswordLogin()

  // 로그인은 API 호출이 아니라 페이지 이동으로 시작한다 — 서버가 provider 인가 화면으로 302시키고,
  // 완료되면 /login/complete로 되돌아온다(성공 여부는 그 라우트가 판정).
  function handleSocialLogin(provider: SocialProvider) {
    setRedirecting(provider)
    window.location.href = socialLoginRedirectUrl(provider, `${window.location.origin}/login/complete`)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-sunken">
      <LoginForm
        onSocialLogin={handleSocialLogin}
        onPasswordLogin={(loginId, password) => passwordLogin.mutate({ loginId, password })}
        redirecting={redirecting}
        passwordPending={passwordLogin.isPending}
        errorMessage={error !== undefined ? loginErrorMessage(error) : null}
        passwordErrorMessage={
          // 서버가 아이디 부재와 비밀번호 불일치를 한 코드로 주므로 둘을 가려 안내하지 않는다.
          passwordLogin.isError ? '아이디 또는 비밀번호가 올바르지 않아요.' : null
        }
      />
    </div>
  )
}

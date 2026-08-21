import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  LoginForm,
  loginErrorMessage,
  socialLoginRedirectUrl,
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

  // 로그인은 API 호출이 아니라 페이지 이동으로 시작한다 — 서버가 provider 인가 화면으로
  // 302시키고, 완료되면 /login/complete로 되돌아온다(성공 여부는 그 라우트가 판정).
  function handleSocialLogin(provider: SocialProvider) {
    setRedirecting(provider)
    window.location.href = socialLoginRedirectUrl(
      provider,
      `${window.location.origin}/login/complete`,
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-sunken">
      <LoginForm
        onSocialLogin={handleSocialLogin}
        redirecting={redirecting}
        errorMessage={error !== undefined ? loginErrorMessage(error) : null}
      />
    </div>
  )
}

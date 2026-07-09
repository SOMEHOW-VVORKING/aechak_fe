import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoginForm, useLogin, type SocialProvider } from '@/features/auth'

export const Route = createFileRoute('/login/')({
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const login = useLogin()

  function handleSocialLogin(provider: SocialProvider) {
    login.mutate(provider, {
      onSuccess: () => navigate({ to: '/' }),
    })
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-sunken">
      <LoginForm onSocialLogin={handleSocialLogin} isLoading={login.isPending} />
    </div>
  )
}

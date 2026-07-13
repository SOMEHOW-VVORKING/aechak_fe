import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Alert, Button, MobileScreen } from '@aechak/design-system/web'
import { useSocialLogin, type SocialProvider } from '@/features/onboarding'
import { login } from '@/shared/auth'

// TODO: placeholder brand marks (colored initial badges) — swap for
// licensed Kakao/Google/Apple logos before shipping; sourcing/recreating
// real brand assets is explicitly deferred for this batch.
const SOCIAL_OPTIONS: {
  provider: SocialProvider
  label: string
  initial: string
  badgeClassName: string
}[] = [
  { provider: 'kakao', label: '카카오로 시작하기', initial: 'K', badgeClassName: 'bg-[#FEE500] text-[#191919]' },
  {
    provider: 'google',
    label: '구글로 시작하기',
    initial: 'G',
    badgeClassName: 'border border-border bg-white text-text-primary',
  },
  { provider: 'apple', label: 'Apple로 시작하기', initial: 'A', badgeClassName: 'bg-black text-white' },
]

export const Route = createFileRoute('/onboarding/login')({
  component: SocialLoginRoute,
})

function SocialLoginRoute() {
  const navigate = useNavigate()
  const socialLogin = useSocialLogin()
  const [showFailureAlert, setShowFailureAlert] = useState(false)

  const handleSocialLogin = (provider: SocialProvider) => {
    setShowFailureAlert(false)
    socialLogin.mutate(provider, {
      onSuccess: () => {
        login()
        navigate({ to: '/onboarding/terms' })
      },
      onError: () => setShowFailureAlert(true),
    })
  }

  return (
    <MobileScreen
      contentClassName="flex flex-col items-center justify-center gap-3.5 px-6 text-center"
      footer={
        <div
          className="flex flex-col gap-2.5 px-6 pt-6"
          style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        >
          {/* 실패 안내는 로그인 버튼 바로 위에 인라인으로 둔다 — 화면 중앙에 붕 뜨지 않고
              방금 누른 액션 옆에서 피드백이 보이도록. */}
          {showFailureAlert && (
            <Alert variant="error" onDismiss={() => setShowFailureAlert(false)}>
              로그인에 실패했어요. 다시 시도해 주세요.
            </Alert>
          )}
          {SOCIAL_OPTIONS.map(({ provider, label, initial, badgeClassName }) => (
            <Button
              key={provider}
              variant="secondary"
              size="lg"
              fullWidth
              loading={socialLogin.isPending && socialLogin.variables === provider}
              disabled={socialLogin.isPending}
              leftIcon={
                <span
                  aria-hidden="true"
                  className={[
                    'flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-bold',
                    badgeClassName,
                  ].join(' ')}
                >
                  {initial}
                </span>
              }
              onClick={() => handleSocialLogin(provider)}
            >
              {label}
            </Button>
          ))}
          <p className="mt-1 text-center text-caption text-text-tertiary">
            시작하면 <span className="font-medium text-text-primary">이용약관</span> 및{' '}
            <span className="font-medium text-text-primary">개인정보처리방침</span>에 동의하게
            돼요.
          </p>
        </div>
      }
    >
      <p className="text-display font-bold text-brand">애착</p>
      <p className="text-body text-text-secondary">
        반려생활의 모든 것,
        <br />
        믿을 수 있는 펫 커머스
      </p>
    </MobileScreen>
  )
}

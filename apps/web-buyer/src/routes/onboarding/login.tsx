import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, MobileScreen } from '@aechak/design-system/web'
import {
  WEB_LOGIN_PROVIDERS,
  socialLoginRedirectUrl,
  type SocialProvider,
} from '@/features/onboarding'

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

export interface LoginSearch {
  /** 로그인 실패 시 /login/complete가 되돌려주는 서버 에러코드 */
  error?: number
}

export const Route = createFileRoute('/onboarding/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const error = Number(search['error'])
    return Number.isFinite(error) && error > 0 ? { error } : {}
  },
  component: SocialLoginRoute,
})

function SocialLoginRoute() {
  const { error } = Route.useSearch()
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [redirecting, setRedirecting] = useState<SocialProvider | null>(null)

  // 로그인은 API 호출이 아니라 페이지 이동으로 시작한다 — 서버가 provider 인가 화면으로 302시키고,
  // 완료되면 /login/complete로 되돌아온다(성공 여부는 그 라우트가 판정).
  const handleSocialLogin = (provider: SocialProvider) => {
    setRedirecting(provider)
    window.location.href = socialLoginRedirectUrl(
      provider,
      `${window.location.origin}/login/complete`,
    )
  }

  const showFailureAlert = error !== undefined && !alertDismissed

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
            <Alert variant="error" onDismiss={() => setAlertDismissed(true)}>
              로그인에 실패했어요. 다시 시도해 주세요.
            </Alert>
          )}
          {SOCIAL_OPTIONS.map(({ provider, label, initial, badgeClassName }) => {
            // 서버 웹 로그인이 열린 provider만 활성 — 구글·애플은 서버 지원 후 개방
            const supported = WEB_LOGIN_PROVIDERS.has(provider)
            return (
              <Button
                key={provider}
                variant="secondary"
                size="lg"
                fullWidth
                loading={redirecting === provider}
                disabled={!supported || redirecting !== null}
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
                {supported ? label : `${label} (준비 중)`}
              </Button>
            )
          })}
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

import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Alert, Button, MobileScreen } from '@aechak/design-system/web'
import {
  WEB_LOGIN_PROVIDERS,
  socialLoginRedirectUrl,
  type SocialProvider,
} from '@/features/onboarding'
import { clearPendingAction } from '@/shared/auth'

// TODO: placeholder brand marks (colored initial badges) — swap for
// licensed Kakao logo before shipping; sourcing/recreating
// real brand assets is explicitly deferred for this batch.
const SOCIAL_OPTIONS: {
  provider: SocialProvider
  label: string
  initial: string
  badgeClassName: string
}[] = [
  { provider: 'kakao', label: '카카오로 시작하기', initial: 'K', badgeClassName: 'bg-[#FEE500] text-[#191919]' },
]

export interface LoginSearch {
  /** 로그인 실패 시 /login/complete가 되돌려주는 서버 에러코드 */
  error?: number
  /** 로그인 안내 시트가 로그인 뒤 다시 실행할 행동(A26)을 남기고 보냈으면 true */
  resume?: boolean
}

export const Route = createFileRoute('/onboarding/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const error = Number(search['error'])
    return {
      ...(Number.isFinite(error) && error > 0 ? { error } : {}),
      ...(search['resume'] === true || search['resume'] === 'true' ? { resume: true } : {}),
    }
  },
  // 대기 행동은 그것을 남긴 시트에서 바로 시작한 로그인에서만 다시 실행한다. 다른 길(찜 게이트, 세션 만료,
  // 홈 가드, 로그인 화면에서 뒤로 갔다가 다시 온 경우)로 들어온 로그인이 예전 행동을 실행하지 않게 지운다.
  beforeLoad: ({ search }) => {
    if (!search.resume) clearPendingAction()
  },
  component: SocialLoginRoute,
})

function SocialLoginRoute() {
  const { error } = Route.useSearch()
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [redirecting, setRedirecting] = useState<SocialProvider | null>(null)
  const navigate = useNavigate()

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
            // 서버 웹 로그인이 열린 provider만 활성
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
          {/* 로그인하지 않고 카탈로그로 가는 유일한 입구다 — `/`는 비회원을 이 화면으로 보내고
              `/market`은 BE가 permitAll로 열어 두었는데, 여기에 버튼이 없으면 비회원은 주소를
              직접 쳐야 그 화면에 닿는다. 문구는 AuthRequiredScreen과 같게 맞춘다. */}
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            disabled={redirecting !== null}
            onClick={() => void navigate({ to: '/market' })}
          >
            상품 둘러보기
          </Button>
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

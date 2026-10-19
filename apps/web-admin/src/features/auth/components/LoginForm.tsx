import type { ReactNode } from 'react'
import { Alert, Button, Card } from '@aechak/design-system/web'
import { Apple, Globe, Info, MessageCircle } from 'lucide-react'
import { WEB_LOGIN_PROVIDERS, type SocialProvider } from '../auth.session'

interface LoginFormProps {
  onSocialLogin: (provider: SocialProvider) => void
  /** 리다이렉트 중인 provider — 해당 버튼에 로딩, 나머지는 비활성. */
  redirecting?: SocialProvider | null
  /** 로그인 실패 복귀(?error=) 인라인 안내. */
  errorMessage?: string | null
}

const SOCIAL_BUTTONS: { provider: SocialProvider; label: string; icon: ReactNode }[] = [
  { provider: 'kakao', label: '카카오로 로그인', icon: <MessageCircle className="size-4" /> },
  { provider: 'google', label: '구글로 로그인', icon: <Globe className="size-4" /> },
  { provider: 'apple', label: 'Apple로 로그인', icon: <Apple className="size-4" /> },
]

export function LoginForm({ onSocialLogin, redirecting = null, errorMessage }: LoginFormProps) {
  return (
    <Card className="flex w-[360px] flex-col gap-4 p-7">
      <div className="flex flex-col items-center gap-1">
        <p className="text-title font-semibold text-text-primary">애착</p>
        <p className="text-body-sm text-text-secondary">운영 백오피스</p>
      </div>

      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      <div className="flex flex-col gap-2">
        {SOCIAL_BUTTONS.map(({ provider, label, icon }) => {
          // 서버 웹 로그인이 열린 provider만 활성 — 구글·애플은 서버 지원 후 개방(web-seller 관례).
          const supported = WEB_LOGIN_PROVIDERS.has(provider)
          return (
            <Button
              key={provider}
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={icon}
              loading={redirecting === provider}
              disabled={!supported || redirecting !== null}
              onClick={() => onSocialLogin(provider)}
            >
              {supported ? label : `${label} (준비 중)`}
            </Button>
          )
        })}
      </div>

      <div className="flex items-start gap-1.5 text-text-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {/* 로그인 자체는 역할을 보지 않는다 — 권한 없는 계정도 로그인은 되고 업무 화면에서 막힌다. */}
        <p className="text-caption leading-relaxed">
          관리자 권한이 있는 계정으로 로그인해 주세요. 권한이 없으면 로그인 후 운영 화면이 열리지 않아요.
        </p>
      </div>
    </Card>
  )
}

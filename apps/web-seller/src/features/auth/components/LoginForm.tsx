import { Alert, Card, KakaoLoginButton } from '@aechak/design-system/web'
import { Info } from 'lucide-react'
import { WEB_LOGIN_PROVIDERS, type SocialProvider } from '../auth.session'

interface LoginFormProps {
  onSocialLogin: (provider: SocialProvider) => void
  /** 리다이렉트 중인 provider — 해당 버튼에 로딩, 나머지는 비활성. */
  redirecting?: SocialProvider | null
  /** 로그인 실패 복귀(?error=) 인라인 안내. */
  errorMessage?: string | null
}

export function LoginForm({ onSocialLogin, redirecting = null, errorMessage }: LoginFormProps) {
  return (
    <Card className="flex w-[360px] flex-col gap-4 p-7">
      <div className="flex flex-col items-center gap-1">
        <p className="text-title font-semibold text-text-primary">애착</p>
        <p className="text-body-sm text-text-secondary">판매자 센터</p>
      </div>

      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      {/* 서버 웹 로그인이 열린 provider만 활성(web-buyer 관례). */}
      <KakaoLoginButton
        loading={redirecting === 'kakao'}
        disabled={!WEB_LOGIN_PROVIDERS.has('kakao') || redirecting !== null}
        onClick={() => onSocialLogin('kakao')}
      />

      <div className="flex items-start gap-1.5 text-text-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p className="text-caption leading-relaxed">
          아직 셀러가 아니어도 로그인 후 스토어 설정에서 입점 신청을 할 수 있어요.
        </p>
      </div>
    </Card>
  )
}

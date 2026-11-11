import { useState } from 'react'
import { Alert, Button, Card, Input, KakaoLoginButton } from '@aechak/design-system/web'
import { Info } from 'lucide-react'
import { WEB_LOGIN_PROVIDERS, type SocialProvider } from '../auth.session'

interface LoginFormProps {
  onSocialLogin: (provider: SocialProvider) => void
  /** 아이디·비밀번호 로그인 제출. */
  onPasswordLogin: (loginId: string, password: string) => void
  /** 리다이렉트 중인 provider — 해당 버튼에 로딩, 나머지는 비활성. */
  redirecting?: SocialProvider | null
  /** 비밀번호 로그인 요청 진행 중. */
  passwordPending?: boolean
  /** 로그인 실패 복귀(?error=) 인라인 안내. */
  errorMessage?: string | null
  /** 비밀번호 로그인 실패 인라인 안내. */
  passwordErrorMessage?: string | null
}

export function LoginForm({
  onSocialLogin,
  onPasswordLogin,
  redirecting = null,
  passwordPending = false,
  errorMessage,
  passwordErrorMessage,
}: LoginFormProps) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const canSubmit = loginId.trim() !== '' && password !== '' && !passwordPending && redirecting === null

  return (
    <Card className="flex w-[360px] flex-col gap-4 p-7">
      <div className="flex flex-col items-center gap-1">
        <p className="text-title font-semibold text-text-primary">애착</p>
        <p className="text-body-sm text-text-secondary">운영 백오피스</p>
      </div>

      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      {/* 심사·운영 계정이 쓰는 채널이라 소셜보다 먼저 둔다. 카카오는 아래에 그대로 남는다. */}
      <form
        className="flex flex-col gap-2"
        onSubmit={event => {
          event.preventDefault()
          if (canSubmit) onPasswordLogin(loginId.trim(), password)
        }}
      >
        <Input
          label="아이디"
          autoComplete="username"
          value={loginId}
          disabled={passwordPending}
          onChange={event => setLoginId(event.target.value)}
        />
        <Input
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          state={passwordErrorMessage != null ? 'error' : 'default'}
          helperText={passwordErrorMessage ?? undefined}
          value={password}
          disabled={passwordPending}
          onChange={event => setPassword(event.target.value)}
        />
        <Button type="submit" size="lg" fullWidth loading={passwordPending} disabled={!canSubmit}>
          로그인
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-border" />
        <span className="text-caption text-text-tertiary">또는</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* 서버 웹 로그인이 열린 provider만 활성(web-seller 관례). */}
      <KakaoLoginButton
        loading={redirecting === 'kakao'}
        disabled={!WEB_LOGIN_PROVIDERS.has('kakao') || redirecting !== null}
        onClick={() => onSocialLogin('kakao')}
      />

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

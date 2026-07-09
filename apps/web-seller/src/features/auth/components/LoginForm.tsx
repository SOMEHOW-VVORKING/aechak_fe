import type { ReactNode } from 'react'
import { Card, Button } from '@aechak/design-system/web'
import { MessageCircle, Globe, Apple, Info } from 'lucide-react'
import type { SocialProvider } from '../auth.mock'

interface LoginFormProps {
  onSocialLogin?: (provider: SocialProvider) => void
  isLoading?: boolean
}

const SOCIAL_BUTTONS: { provider: SocialProvider; label: string; icon: ReactNode }[] = [
  { provider: 'kakao', label: '카카오로 로그인', icon: <MessageCircle className="size-4" /> },
  { provider: 'google', label: '구글로 로그인', icon: <Globe className="size-4" /> },
  { provider: 'apple', label: 'Apple로 로그인', icon: <Apple className="size-4" /> },
]

export function LoginForm({ onSocialLogin, isLoading = false }: LoginFormProps) {
  return (
    <Card className="flex w-[360px] flex-col gap-4 p-7">
      <div className="flex flex-col items-center gap-1">
        <p className="text-title font-semibold text-text-primary">애착</p>
        <p className="text-body-sm text-text-secondary">판매자 센터</p>
      </div>

      <div className="flex flex-col gap-2">
        {SOCIAL_BUTTONS.map(({ provider, label, icon }) => (
          <Button
            key={provider}
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            leftIcon={icon}
            disabled={isLoading}
            onClick={() => onSocialLogin?.(provider)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-text-tertiary">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p className="text-caption leading-relaxed">입점 승인된 셀러 계정만 접근할 수 있어요.</p>
      </div>

      <div className="border-t border-border" />

      <div className="flex items-center justify-between gap-2.5">
        <p className="text-body-sm text-text-secondary">아직 셀러가 아니신가요?</p>
        <Button type="button" variant="secondary" size="sm">
          셀러 입점 신청
        </Button>
      </div>
    </Card>
  )
}

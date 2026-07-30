import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Alert, BottomFixedAction, Button, Input, MobileScreen } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { useAccount } from '@/shared/account'
import { useSendOtp, useVerifyPhone } from '../account.queries'
import { OTP_LENGTH, isValidOtp } from '../account.mock'

// 본인 인증(b10-st-9). 미인증(9-A) → 휴대폰 OTP 인증 → 인증 완료(9-B). 테스트 고정 인증번호로 목업.
export function VerifyScreen() {
  const account = useAccount()
  const sendOtp = useSendOtp()
  const verifyPhone = useVerifyPhone()

  const [phone, setPhone] = useState(account.phone)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(false)

  const goBack = useSafeBack({ to: '/mypage' })

  const handleSend = () => {
    sendOtp.mutate(phone, {
      onSuccess: () => {
        setSent(true)
        setCode('')
        setError(false)
      },
    })
  }

  const handleVerify = () => {
    if (!isValidOtp(code)) {
      setError(true)
      return
    }
    verifyPhone.mutate(phone)
  }

  // ── 9-B 인증 완료 ──
  if (account.verification === 'verified') {
    return (
      <MobileScreen
        header={<BackAppBar onBack={goBack} title="본인 인증" />}
        footer={<BottomFixedAction primary={{ label: '확인', onClick: goBack }} />}
      >
        {/* 완료 안내는 콘텐츠 영역 세로 중앙에 배치(상단에 붙이지 않음). */}
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-surface text-success-fg">
            <BadgeCheck className="size-10" />
          </span>
          <div className="flex flex-col items-center gap-1">
            <p className="text-subheading font-semibold text-text-primary">본인 인증 완료</p>
            <p className="text-center text-body-sm text-text-secondary">
              휴대폰 본인 인증이 완료됐어요.
            </p>
          </div>
        </div>
      </MobileScreen>
    )
  }

  // ── 9-A 미인증 ──
  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="본인 인증" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '인증 완료',
            onClick: handleVerify,
            disabled: !sent || code.length !== OTP_LENGTH,
            loading: verifyPhone.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        <Alert variant="info">
          안전한 거래를 위해 휴대폰 번호를 인증해 주세요.
        </Alert>

        {/* 휴대폰 번호 + 인증번호 받기/재전송 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="verify-phone" className="text-label font-medium text-text-primary">
            휴대폰 번호
          </label>
          <div className="flex items-start gap-2">
            {/* DS Input에 flex-1을 직접 주면 내부 field 높이가 40→25px로 무너진다 — flex-1 래퍼로 감싼다. */}
            <div className="flex-1">
              <Input
                id="verify-phone"
                value={phone}
                inputMode="tel"
                onChange={e => setPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={handleSend}
              loading={sendOtp.isPending}
              disabled={phone.trim() === ''}
              className="flex-none"
            >
              {sent ? '재전송' : '인증번호 받기'}
            </Button>
          </div>
        </div>

        {/* 인증번호 입력(발송 후 노출) */}
        {sent && (
          <Input
            label="인증번호"
            value={code}
            inputMode="numeric"
            maxLength={OTP_LENGTH}
            onChange={e => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))
              setError(false)
            }}
            placeholder={`${OTP_LENGTH}자리 숫자`}
            state={error ? 'error' : 'default'}
            helperText={error ? '인증번호가 올바르지 않아요.' : undefined}
          />
        )}
      </div>
    </MobileScreen>
  )
}

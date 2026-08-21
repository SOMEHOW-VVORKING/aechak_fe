import { useEffect, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import {
  Alert,
  BottomFixedAction,
  Button,
  EmptyState,
  Input,
  MobileScreen,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { useMe } from '@/shared/account'
import {
  phoneVerificationErrorMessage,
  useConfirmPhoneCode,
  useSendPhoneCode,
} from '../account.queries'
import { OTP_LENGTH, isValidPhoneNumber } from '../account.mock'

// 남은 초를 'M:SS'로 그린다(만료 카운트다운 표시용).
function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// 본인 인증(b10-st-9). 미인증(9-A) → 휴대폰 OTP 인증 → 인증 완료(9-B).
// 실서버 연동 — 인증 여부의 진실 원본은 GET /users/me(isPhoneVerified)이고, 발송/확인은
// POST /users/me/phone/verifications(/confirm)다. 재발송 쿨다운·만료 타이머는 발송 응답의
// resendCooldownSeconds/expiresInSeconds가 원천(수치 하드코딩 금지 — 서버 계약).
export function VerifyScreen() {
  const { account, isLoading, isError, refetch } = useMe()
  const sendCode = useSendPhoneCode()
  const confirmCode = useConfirmPhoneCode()

  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  // 발송 응답의 초를 절대 시각(deadline)으로 바꿔 들고, 1초 틱으로 남은 시간을 파생한다.
  const [resendDeadline, setResendDeadline] = useState<number | null>(null)
  const [expireDeadline, setExpireDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const goBack = useSafeBack({ to: '/mypage' })

  useEffect(() => {
    if (!sent) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sent])

  const secondsLeft = (deadline: number | null) =>
    deadline == null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  const resendLeft = secondsLeft(resendDeadline)
  const expireLeft = secondsLeft(expireDeadline)

  const handleSend = () => {
    const normalized = phone.trim()
    if (!isValidPhoneNumber(normalized)) {
      setPhoneError('휴대폰 번호 형식을 확인해 주세요.')
      return
    }
    setPhoneError(null)
    sendCode.mutate(normalized, {
      onSuccess: issued => {
        const issuedAt = Date.now()
        setSent(true)
        setCode('')
        setCodeError(null)
        setNow(issuedAt)
        setResendDeadline(issuedAt + issued.resendCooldownSeconds * 1000)
        setExpireDeadline(issuedAt + issued.expiresInSeconds * 1000)
      },
      onError: err => setPhoneError(phoneVerificationErrorMessage(err)),
    })
  }

  const handleVerify = () => {
    confirmCode.mutate(
      { phoneNumber: phone.trim(), code },
      {
        // 성공은 계정 캐시 갱신(useConfirmPhoneCode)으로 9-B 분기가 스스로 렌더된다.
        onError: err => setCodeError(phoneVerificationErrorMessage(err)),
      },
    )
  }

  const header = <BackAppBar onBack={goBack} title="본인 인증" />

  if (isLoading || (!account && !isError)) {
    return (
      <MobileScreen header={header}>
        <div className="flex flex-col gap-5 p-4">
          <div className="h-14 animate-pulse rounded-input bg-surface-sunken" />
          <div className="h-10 animate-pulse rounded-input bg-surface-sunken" />
        </div>
      </MobileScreen>
    )
  }

  if (isError) {
    return (
      <MobileScreen header={header}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="인증 정보를 불러오지 못했어요"
            description="잠시 후 다시 시도해주세요."
            action={{ label: '다시 시도', onClick: () => void refetch() }}
          />
        </div>
      </MobileScreen>
    )
  }

  // ── 9-B 인증 완료 ──
  if (account?.verification === 'verified') {
    return (
      <MobileScreen
        header={header}
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
      header={header}
      footer={
        <BottomFixedAction
          primary={{
            label: '인증 완료',
            onClick: handleVerify,
            disabled: !sent || code.length !== OTP_LENGTH,
            loading: confirmCode.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        <Alert variant="info">
          안전한 거래를 위해 휴대폰 번호를 인증해 주세요.
        </Alert>

        {/* 휴대폰 번호 + 인증번호 받기/재전송(쿨다운은 서버 응답 기준) */}
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
                onChange={e => {
                  setPhone(e.target.value)
                  setPhoneError(null)
                }}
                placeholder="010-0000-0000"
                state={phoneError ? 'error' : 'default'}
                helperText={phoneError ?? undefined}
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={handleSend}
              loading={sendCode.isPending}
              disabled={phone.trim() === '' || resendLeft > 0}
              className="flex-none"
            >
              {sent ? (resendLeft > 0 ? `재전송 (${resendLeft}초)` : '재전송') : '인증번호 받기'}
            </Button>
          </div>
        </div>

        {/* 인증번호 입력(발송 후 노출). 만료 전엔 남은 시간을, 만료 후엔 재전송 유도를 보여준다. */}
        {sent && (
          <Input
            label="인증번호"
            value={code}
            inputMode="numeric"
            maxLength={OTP_LENGTH}
            onChange={e => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))
              setCodeError(null)
            }}
            placeholder={`${OTP_LENGTH}자리 숫자`}
            state={codeError ? 'error' : 'default'}
            helperText={
              codeError ??
              (expireLeft > 0
                ? `남은 시간 ${formatSeconds(expireLeft)}`
                : '인증번호가 만료됐어요. 재전송해 주세요.')
            }
          />
        )}
      </div>
    </MobileScreen>
  )
}

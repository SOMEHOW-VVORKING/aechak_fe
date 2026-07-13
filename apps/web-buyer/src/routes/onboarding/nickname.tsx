import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { BottomFixedAction, Input, MobileScreen } from '@aechak/design-system/web'
import { NICKNAME_MIN_LENGTH, OnboardingHeader, useNicknameAvailability } from '@/features/onboarding'

const NICKNAME_MAX_LENGTH = 12
const DEBOUNCE_MS = 400

export const Route = createFileRoute('/onboarding/nickname')({
  component: NicknameSetupRoute,
})

function NicknameSetupRoute() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [debounced, setDebounced] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(nickname), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [nickname])

  const { data: isAvailable, isFetching } = useNicknameAvailability(debounced)

  const isValidLength = nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH
  const isChecking = isValidLength && (debounced !== nickname || isFetching)
  const canSubmit = isValidLength && !isChecking && isAvailable === true

  let state: 'default' | 'error' | 'success' = 'default'
  let helperText: string | undefined
  if (isChecking) {
    helperText = '중복 확인 중...'
  } else if (isValidLength && isAvailable === true) {
    state = 'success'
    helperText = '사용할 수 있는 닉네임이에요'
  } else if (isValidLength && isAvailable === false) {
    state = 'error'
    helperText = '이미 사용 중인 닉네임이에요'
  }

  const handleStart = () => {
    if (!canSubmit) return
    setCompleted(true)
  }

  // The buyer home screen hasn't been built yet (out of scope for this
  // onboarding-only batch), so completion is shown inline rather than
  // routing to a screen that doesn't exist.
  if (completed) {
    return (
      <MobileScreen contentClassName="flex flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="size-12 text-success-fg" />
        <h1 className="text-heading font-bold text-text-primary">온보딩 완료!</h1>
        <p className="text-body-sm text-text-secondary">
          {nickname}님, 애착에 오신 것을 환영해요.
          <br />
          메인 화면은 다음 배치에서 만나요.
        </p>
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      header={
        <OnboardingHeader
          onBack={() => navigate({ to: '/onboarding/terms' })}
          step={{ current: 2, total: 2 }}
        />
      }
      footer={
        <BottomFixedAction
          primary={{ label: '애착 시작하기', onClick: handleStart, disabled: !canSubmit }}
        />
      }
      contentClassName="flex flex-col gap-5 px-4 py-4"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading font-bold text-text-primary">닉네임을 정해 주세요</h1>
        <p className="text-body-sm text-text-secondary">2~12자, 한글/영문/숫자를 사용할 수 있어요</p>
      </div>
      <Input
        label="닉네임 *"
        value={nickname}
        onChange={e => setNickname(e.target.value.slice(0, NICKNAME_MAX_LENGTH))}
        maxLength={NICKNAME_MAX_LENGTH}
        state={state}
        helperText={helperText}
        placeholder="닉네임을 입력해 주세요"
        rightAddon={
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-text-tertiary">
              {nickname.length}/{NICKNAME_MAX_LENGTH}
            </span>
            {state === 'success' && <CheckCircle2 className="size-[18px] text-success-fg" />}
          </div>
        }
      />
    </MobileScreen>
  )
}

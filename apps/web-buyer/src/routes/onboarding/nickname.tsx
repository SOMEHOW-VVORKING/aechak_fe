import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import { errorResponse } from '@aechak/api'
import { Alert, BottomFixedAction, Input, MobileScreen } from '@aechak/design-system/web'
import {
  NICKNAME_MAX_LENGTH,
  OnboardingHeader,
  onboardingErrorMessage,
  useNicknameAvailability,
  useSetNickname,
} from '@/features/onboarding'
import { setNickname as syncAccountNickname } from '@/shared/account'
import { peekPendingAction, resumeReturnPath } from '@/shared/auth'

const DEBOUNCE_MS = 400

export const Route = createFileRoute('/onboarding/nickname')({
  component: NicknameSetupRoute,
})

function NicknameSetupRoute() {
  const navigate = useNavigate()
  const submit = useSetNickname()
  const [nickname, setNickname] = useState('')
  const [debounced, setDebounced] = useState('')
  const [completed, setCompleted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(nickname), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [nickname])

  // 형식(30002)과 가용 여부는 중복 확인 응답이 함께 알려준다 — 클라이언트 정규식 없이 서버 판정을 그대로 보여준다.
  const { data: isAvailable, error: checkError, isFetching } = useNicknameAvailability(debounced)

  const isChecking = nickname !== '' && (debounced !== nickname || isFetching)
  const canSubmit = nickname !== '' && !isChecking && isAvailable === true && !submit.isPending

  let state: 'default' | 'error' | 'success' = 'default'
  let helperText: string | undefined
  if (nickname === '') {
    // 입력 전에는 안내 없음(디바운스 전 값에 대한 이전 판정이 남아 보이지 않게).
  } else if (isChecking) {
    helperText = '중복 확인 중...'
  } else if (checkError) {
    state = 'error'
    helperText = onboardingErrorMessage(checkError)
  } else if (isAvailable === true) {
    state = 'success'
    helperText = '사용할 수 있는 닉네임이에요'
  } else if (isAvailable === false) {
    state = 'error'
    helperText = '이미 사용 중인 닉네임이에요'
  }

  const handleStart = () => {
    if (!canSubmit) return
    setSubmitError(null)
    // 최종 판정은 PUT이 한다(중복 확인은 보조). 성공 응답의 status=ACTIVE로 전이를 확인한다.
    submit.mutate(nickname, {
      onSuccess: user => {
        if (user.status === 'ACTIVE') {
          // 온보딩으로 확정된 닉네임을 마이페이지·리뷰 화면이 읽는 계정 스토어에도 반영한다.
          // 스토어는 아직 목업이라(서버 GET /users/me 기반 전환 전) 온보딩 완료 시 동기화가 필요하다 —
          // 안 하면 실서버로 닉네임을 바꿔도 마이/리뷰 화면이 시드값을 계속 보여준다.
          syncAccountNickname(user.nickname ?? nickname)
          setCompleted(true)
        }
      },
      onError: error => {
        const errorCode = errorResponse(error)?.data?.errorCode
        // 필수 동의 미완(30300): 약관 화면으로 되돌린다.
        if (errorCode === 30300) {
          navigate({ to: '/onboarding/terms' })
          return
        }
        // 이미 ACTIVE(30004): 온보딩을 다시 탈 필요가 없으니 홈으로 보낸다.
        if (errorCode === 30004) {
          navigate({ to: '/', replace: true })
          return
        }
        // 30001(중복)·30002(형식)는 인라인으로 표시한다.
        setSubmitError(onboardingErrorMessage(error))
      },
    })
  }

  // 완료 화면 — 사용자가 매듭을 짓고 스스로 홈으로 들어가게 한다(자동 이동/타이머 없음).
  // 헤더(뒤로가기) 없음: 완료 후 온보딩으로 되돌아갈 지점이 아니다. replace로 히스토리에서도 뺀다.
  if (completed) {
    // 로그인 안내 시트에서 가입했으면(A26) 보던 화면으로 돌아가 그 화면이 대기 행동을 꺼낸다.
    const goNext = () => {
      const returnTo = resumeReturnPath()
      if (returnTo) navigate({ href: returnTo, replace: true })
      else navigate({ to: '/', replace: true })
    }
    return (
      <MobileScreen
        footer={
          <BottomFixedAction
            primary={{ label: peekPendingAction() ? '보던 화면으로 가기' : '홈으로 가기', onClick: goNext }}
          />
        }
        contentClassName="flex flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <CheckCircle2 className="size-16 text-success-fg" />
        <h1 className="text-heading font-bold text-text-primary">가입 완료!</h1>
        <p className="text-body-sm text-text-secondary">{nickname}님, 애착에 오신 걸 환영해요.</p>
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
          primary={{
            label: '애착 시작하기',
            onClick: handleStart,
            disabled: !canSubmit,
            loading: submit.isPending,
          }}
        />
      }
      contentClassName="flex flex-col gap-5 px-4 py-4"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading font-bold text-text-primary">닉네임을 정해 주세요</h1>
        <p className="text-body-sm text-text-secondary">2~12자, 한글/영문/숫자를 사용할 수 있어요</p>
      </div>

      {submitError && (
        <Alert variant="error" onDismiss={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <Input
        label="닉네임 *"
        value={nickname}
        onChange={e => setNickname(e.target.value)}
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

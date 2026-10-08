import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { errorResponse } from '@aechak/api'
import {
  Alert,
  BottomFixedAction,
  Checkbox,
  EmptyState,
  MobileScreen,
  Skeleton,
} from '@aechak/design-system/web'
import {
  OnboardingHeader,
  onboardingErrorMessage,
  useSubmitConsents,
  useTerms,
  type OnboardingTerm,
} from '@/features/onboarding'

export const Route = createFileRoute('/onboarding/terms')({
  component: TermsAgreementRoute,
})

function TermsAgreementRoute() {
  const navigate = useNavigate()
  const { terms, isLoading, isError, refetch } = useTerms()
  const submit = useSubmitConsents()
  const [agreed, setAgreed] = useState<Record<number, boolean>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const requiredTerms = terms.filter(t => t.isRequired)
  const optionalTerms = terms.filter(t => !t.isRequired)

  const allAgreed = terms.length > 0 && terms.every(t => agreed[t.termId])

  const toggleTerm = (termId: number) => {
    setAgreed(prev => ({ ...prev, [termId]: !prev[termId] }))
  }

  const toggleAll = () => {
    const next = !allAgreed
    setAgreed(Object.fromEntries(terms.map(t => [t.termId, next])))
  }

  // 필수 동의 게이트는 서버가 판정한다 — BE ConsentService가 requiredAllAgreed=false면 REQUIRED_CONSENT_MISSING(403/30300)을
  // 던지므로 체크값을 그대로 보내고 거절 문구를 인라인으로 보여준다(버튼은 잠그지 않는다).
  const handleNext = () => {
    if (submit.isPending) return
    setSubmitError(null)
    // 활성 약관 전체를 체크값 그대로 실어 서버가 기록한다.
    const items = terms.map(t => ({ termId: t.termId, isAgreed: agreed[t.termId] ?? false }))
    submit.mutate(items, {
      onSuccess: () => navigate({ to: '/onboarding/nickname' }),
      onError: error => {
        const errorCode = errorResponse(error)?.data?.errorCode
        // 이미 ACTIVE(30004): 온보딩을 다시 탈 필요가 없으니 홈으로 보낸다.
        if (errorCode === 30004) {
          navigate({ to: '/', replace: true })
          return
        }
        // 약관이 그 사이 바뀜(30400): 목록을 다시 읽어 최신 약관으로 재동의하게 한다.
        if (errorCode === 30400) {
          setAgreed({})
          void refetch()
        }
        setSubmitError(onboardingErrorMessage(error))
      },
    })
  }

  const renderTermRow = (item: OnboardingTerm) => {
    const isChecked = agreed[item.termId] ?? false
    return (
      <div key={item.termId} className="flex items-center gap-2 py-2">
        <Checkbox checked={isChecked} onChange={() => toggleTerm(item.termId)} />
        <button
          type="button"
          onClick={() => toggleTerm(item.termId)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className={[
              'flex-none rounded px-1.5 py-0.5 text-badge font-semibold',
              item.isRequired
                ? 'bg-brand-subtle text-brand'
                : 'bg-surface-sunken text-text-tertiary',
            ].join(' ')}
          >
            {item.isRequired ? '필수' : '선택'}
          </span>
          <span className="text-body-sm text-text-primary">{item.title}</span>
        </button>
      </div>
    )
  }

  return (
    <MobileScreen
      header={
        <OnboardingHeader
          onBack={() => navigate({ to: '/onboarding/login' })}
          step={{ current: 1, total: 2 }}
        />
      }
      footer={
        !isLoading && !isError ? (
          <BottomFixedAction
            primary={{
              label: '다음',
              onClick: handleNext,
              loading: submit.isPending,
            }}
          />
        ) : undefined
      }
      contentClassName="flex flex-col gap-5 px-4 py-4"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading font-bold text-text-primary">약관에 동의해 주세요</h1>
        <p className="text-body-sm text-text-secondary">
          서비스 이용을 위해 필수 약관에 동의가 필요해요
        </p>
      </div>

      {submitError && (
        <Alert variant="error" onDismiss={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          title="약관을 불러오지 못했어요"
          description="잠시 후 다시 시도해 주세요"
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-border-subtle py-2">
            <Checkbox checked={allAgreed} onChange={toggleAll} />
            <button
              type="button"
              onClick={toggleAll}
              className="text-left text-subheading font-semibold text-text-primary"
            >
              전체 동의
            </button>
          </div>

          <div className="flex flex-col">
            {requiredTerms.map(renderTermRow)}
            {optionalTerms.map(renderTermRow)}
          </div>
        </>
      )}
    </MobileScreen>
  )
}

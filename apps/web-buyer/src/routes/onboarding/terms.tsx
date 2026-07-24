import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BottomFixedAction, Checkbox, MobileScreen } from '@aechak/design-system/web'
import { OnboardingHeader } from '@/features/onboarding'

interface TermItem {
  key: string
  label: string
  required: boolean
}

const TERMS: TermItem[] = [
  { key: 'age', label: '만 14세 이상입니다', required: true },
  { key: 'service', label: '서비스 이용약관', required: true },
  { key: 'privacy', label: '개인정보 처리방침', required: true },
  { key: 'location', label: '위치기반 서비스 약관', required: true },
  { key: 'marketing', label: '마케팅 정보 수신', required: false },
]

const REQUIRED_TERMS = TERMS.filter(t => t.required)
const OPTIONAL_TERMS = TERMS.filter(t => !t.required)

export const Route = createFileRoute('/onboarding/terms')({
  component: TermsAgreementRoute,
})

function TermsAgreementRoute() {
  const navigate = useNavigate()
  const [agreed, setAgreed] = useState<Record<string, boolean>>({})

  const allAgreed = TERMS.every(t => agreed[t.key])
  // 필수 약관을 모두 체크해야만 다음으로 갈 수 있다(버튼 활성 조건). 선택 약관은 무관.
  const requiredAgreed = REQUIRED_TERMS.every(t => agreed[t.key])

  const toggleTerm = (key: string) => {
    setAgreed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleAll = () => {
    const next = !allAgreed
    setAgreed(Object.fromEntries(TERMS.map(t => [t.key, next])))
  }

  const handleNext = () => {
    if (!requiredAgreed) return
    navigate({ to: '/onboarding/nickname' })
  }

  const renderTermRow = (item: TermItem) => {
    const isChecked = agreed[item.key] ?? false
    return (
      <div key={item.key} className="flex items-center gap-2 py-2">
        <Checkbox checked={isChecked} onChange={() => toggleTerm(item.key)} />
        <button
          type="button"
          onClick={() => toggleTerm(item.key)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className={[
              'flex-none rounded px-1.5 py-0.5 text-badge font-semibold',
              item.required ? 'bg-brand-subtle text-brand' : 'bg-surface-sunken text-text-tertiary',
            ].join(' ')}
          >
            {item.required ? '필수' : '선택'}
          </span>
          <span className="text-body-sm text-text-primary">{item.label}</span>
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
        <BottomFixedAction
          primary={{ label: '다음', onClick: handleNext, disabled: !requiredAgreed }}
        />
      }
      contentClassName="flex flex-col gap-5 px-4 py-4"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading font-bold text-text-primary">약관에 동의해 주세요</h1>
        <p className="text-body-sm text-text-secondary">
          서비스 이용을 위해 필수 약관에 동의가 필요해요
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border-subtle py-2">
        <Checkbox checked={allAgreed} onChange={toggleAll} />
        <button type="button" onClick={toggleAll} className="text-left text-subheading font-semibold text-text-primary">
          전체 동의
        </button>
      </div>

      <div className="flex flex-col">
        {REQUIRED_TERMS.map(renderTermRow)}
        {OPTIONAL_TERMS.map(renderTermRow)}
      </div>
    </MobileScreen>
  )
}

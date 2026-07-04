import { ArrowLeft } from 'lucide-react'
import { Button, StepProgress } from '@aechak/design-system/web'

export interface OnboardingHeaderProps {
  onBack: () => void
  step: { current: number; total: number }
}

export function OnboardingHeader({ onBack, step }: OnboardingHeaderProps) {
  return (
    <div className="flex flex-col gap-3 px-2 pb-3 pt-2">
      <Button variant="ghost" size="sm" aria-label="뒤로 가기" onClick={onBack} className="w-9 justify-center px-0">
        <ArrowLeft className="size-5" />
      </Button>
      <div className="px-2">
        <StepProgress current={step.current} total={step.total} />
      </div>
    </div>
  )
}

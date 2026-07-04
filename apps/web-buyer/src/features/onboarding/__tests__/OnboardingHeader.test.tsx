import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OnboardingHeader } from '../components/OnboardingHeader'

// AC-ONBOARD-002: 온보딩 헤더는 뒤로가기 버튼과 진행 단계를 표시한다
describe('OnboardingHeader', () => {
  it('[AC-ONBOARD-002] renders a back button and calls onBack when pressed', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<OnboardingHeader onBack={onBack} step={{ current: 1, total: 2 }} />)

    await user.click(screen.getByRole('button', { name: /뒤로 가기/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('[AC-ONBOARD-002] renders a progressbar reflecting the current step', () => {
    render(<OnboardingHeader onBack={() => {}} step={{ current: 2, total: 2 }} />)
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '2')
  })
})

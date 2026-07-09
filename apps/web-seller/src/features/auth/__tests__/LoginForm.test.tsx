import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LoginForm } from '../components/LoginForm'

// AC-AUTH-001: 카카오/구글/Apple 소셜 로그인 버튼 3개가 순서대로 렌더링된다
describe('LoginForm', () => {
  it('[AC-AUTH-001] renders kakao, google, apple social login buttons in order', () => {
    render(<LoginForm />)
    const buttons = [
      screen.getByRole('button', { name: '카카오로 로그인' }),
      screen.getByRole('button', { name: '구글로 로그인' }),
      screen.getByRole('button', { name: 'Apple로 로그인' }),
    ]
    const allButtons = screen.getAllByRole('button')
    expect(allButtons.slice(0, 3)).toEqual(buttons)
  })

  it('[AC-AUTH-001] calls onSocialLogin with the clicked provider', async () => {
    const user = userEvent.setup()
    const onSocialLogin = vi.fn()

    render(<LoginForm onSocialLogin={onSocialLogin} />)

    await user.click(screen.getByRole('button', { name: '구글로 로그인' }))

    expect(onSocialLogin).toHaveBeenCalledWith('google')
  })

  it('[AC-AUTH-001] disables social buttons when isLoading is true', () => {
    render(<LoginForm isLoading />)
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '구글로 로그인' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apple로 로그인' })).toBeDisabled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LoginForm } from '../components/LoginForm'

// AC-AUTH-001: 이메일과 비밀번호 입력 필드와 제출 버튼이 렌더링된다
describe('LoginForm', () => {
  it('[AC-AUTH-001] renders email field, password field, and submit button', () => {
    render(<LoginForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /로그인/i })).toBeInTheDocument()
  })

  it('[AC-AUTH-001] calls onSubmit with email and password when form is submitted', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<LoginForm onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'admin@aechak.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /로그인/i }))

    expect(onSubmit).toHaveBeenCalledWith('admin@aechak.com', 'password123')
  })

  it('[AC-AUTH-001] shows loading state when isLoading is true', () => {
    render(<LoginForm onSubmit={vi.fn()} isLoading />)
    const button = screen.getByRole('button', { name: /로그인/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

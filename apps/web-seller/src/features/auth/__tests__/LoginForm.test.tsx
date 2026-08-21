import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { LoginForm } from '../components/LoginForm'

describe('LoginForm (서버 웹 로그인)', () => {
  it('[AC-AUTH-001] 카카오만 활성이고 구글/Apple은 준비 중으로 비활성이다', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '구글로 로그인 (준비 중)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apple로 로그인 (준비 중)' })).toBeDisabled()
  })

  it('[AC-AUTH-002] 카카오 클릭 시 onSocialLogin(kakao)를 호출한다', async () => {
    const user = userEvent.setup()
    const onSocialLogin = vi.fn()
    render(<LoginForm onSocialLogin={onSocialLogin} />)

    await user.click(screen.getByRole('button', { name: '카카오로 로그인' }))

    expect(onSocialLogin).toHaveBeenCalledWith('kakao')
  })

  it('[AC-AUTH-003] 리다이렉트 중에는 모든 버튼이 잠긴다', () => {
    render(<LoginForm redirecting="kakao" />)
    // 로딩 중 버튼은 스피너가 붙어도 disabled로 잠긴다.
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })

  it('[AC-AUTH-004] 로그인 실패 복귀 문구를 인라인으로 보여준다', () => {
    render(<LoginForm errorMessage="로그인에 실패했어요. 다시 시도해 주세요." />)
    expect(screen.getByText('로그인에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })
})

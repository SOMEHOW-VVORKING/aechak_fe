import { useState } from 'react'
import { Button, Input } from '@aechak/design-system/web'

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void
  isLoading?: boolean
}

export function LoginForm({ onSubmit, isLoading = false }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSubmit(email, password)
      }}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <Input
        type="email"
        label="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="admin@aechak.com"
        required
      />
      <Input
        type="password"
        label="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
      />
      {/* 로딩 표시는 DS Button의 스피너(aria-busy + disabled) 하나로 — 텍스트까지 바꾸면 상태 표시가 겹친다. */}
      <Button type="submit" loading={isLoading}>
        로그인
      </Button>
    </form>
  )
}

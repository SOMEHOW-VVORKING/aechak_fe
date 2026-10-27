import { useState } from 'react'
import { Button, Card, FormSection, Input, StatusPill, Toggle } from '@aechak/design-system/web'
import { SAMPLE_ACCOUNT } from '../account.mock'

interface SecuritySettingsCardProps {
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onChangePassword: () => void
  onToggleMfa: () => void
}

export function SecuritySettingsCard({
  onChangePassword,
  onToggleMfa,
}: SecuritySettingsCardProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(SAMPLE_ACCOUNT.mfaEnabled)

  const mismatch = confirm !== '' && next !== confirm
  const canChange = current !== '' && next !== '' && !mismatch

  return (
    <div className="flex flex-col gap-4">
      <FormSection title="비밀번호 변경">
        <Input
          label="지금 비밀번호"
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={event => setCurrent(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="새 비밀번호"
            type="password"
            value={next}
            autoComplete="new-password"
            helperText="영문/숫자/기호를 섞어 10자 이상"
            onChange={event => setNext(event.target.value)}
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            value={confirm}
            autoComplete="new-password"
            state={mismatch ? 'error' : 'default'}
            helperText={mismatch ? '새 비밀번호와 달라요.' : undefined}
            onChange={event => setConfirm(event.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button variant="primary" size="md" disabled={!canChange} onClick={onChangePassword}>
            비밀번호 변경
          </Button>
        </div>
      </FormSection>

      <Card padding="md">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
              2단계 인증
              {mfaEnabled ? (
                <StatusPill variant="success" size="sm">
                  사용 중
                </StatusPill>
              ) : (
                <StatusPill variant="neutral" size="sm">
                  꺼짐
                </StatusPill>
              )}
            </p>
            <p className="mt-0.5 text-caption text-text-tertiary">
              로그인할 때 문자나 인증 앱으로 받은 숫자를 한 번 더 넣어요. 켜 두면 비밀번호가 새어도
              남이 들어오기 어려워요.
            </p>
          </div>
          <Toggle
            checked={mfaEnabled}
            ariaLabel="2단계 인증 사용"
            onChange={checked => {
              setMfaEnabled(checked)
              onToggleMfa()
            }}
          />
        </div>
      </Card>
    </div>
  )
}

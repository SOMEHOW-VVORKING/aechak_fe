import { useState } from 'react'
import { Button, Card, FormSection, Input, StatusPill, Toggle } from '@aechak/design-system/web'
import { SAMPLE_ACCOUNT } from '../account.mock'

interface SecuritySettingsCardProps {
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onChangePassword: () => void
  onToggleMfa: () => void
}

/** 아래 helperText가 글자로 약속하는 길이 — 문구와 검사가 갈라지지 않게 한 곳에 둔다. */
const PASSWORD_MIN_LENGTH = 10

export function SecuritySettingsCard({
  onChangePassword,
  onToggleMfa,
}: SecuritySettingsCardProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(SAMPLE_ACCOUNT.mfaEnabled)

  const mismatch = confirm !== '' && next !== confirm
  // 적어 둔 조건("10자 이상")을 실제로 검사한다 — 글자로 말한 규칙을 폼이 지키지 않으면 예시 화면이
  // 보여 주는 검증 동작이 거짓이 된다(교차검토 지적).
  const tooShort = next !== '' && next.length < PASSWORD_MIN_LENGTH
  // 확인 칸을 **비운 채로도** 눌릴 수 있던 자리를 막는다 — 빈 확인은 mismatch가 false라 통과했다.
  const canChange = current !== '' && !tooShort && confirm !== '' && !mismatch

  // 토글을 켜면 pill이 "사용 중"으로 바뀌는데 저장은 되지 않는다 — 토스트가 사라진 뒤 이 카드만 보는
  // 운영자가 계정이 보호된다고 믿을 자리다. 그래서 기준값과 달라지면 화면에 남는 글자로 알린다.
  const mfaChanged = mfaEnabled !== SAMPLE_ACCOUNT.mfaEnabled

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
            state={tooShort ? 'error' : 'default'}
            helperText={
              tooShort
                ? `${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`
                : `영문/숫자/기호를 섞어 ${PASSWORD_MIN_LENGTH}자 이상`
            }
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
            <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-text-primary">
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
              {/* 켠 상태가 저장된 것으로 읽히지 않게 pill 옆에 글자로 붙인다(색·점이 아니라 글자). */}
              {mfaChanged && (
                <StatusPill variant="warning" size="sm">
                  저장 안 됨
                </StatusPill>
              )}
            </p>
            <p className="mt-0.5 text-caption text-text-tertiary">
              로그인할 때 문자나 인증 앱으로 받은 숫자를 한 번 더 넣어요. 켜 두면 비밀번호가 새어도
              남이 들어오기 어려워요.
            </p>
            <p className="mt-1 text-caption text-warning-fg">
              예시 화면이라 이 토글은 저장되지 않아요. 새로고침하면
              {SAMPLE_ACCOUNT.mfaEnabled ? ' 켜진' : ' 꺼진'} 상태로 돌아가요.
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

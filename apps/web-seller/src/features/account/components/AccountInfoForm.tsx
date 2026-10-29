import { useState } from 'react'
import { Button, FormSection, Input } from '@aechak/design-system/web'
import { SAMPLE_ACCOUNT } from '../account.mock'

interface AccountInfoFormProps {
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onSave: () => void
}

// 스토어 설정 폼과 같은 패턴(FormSection + DS Input) — 새 폼 프리미티브를 만들지 않는다.
export function AccountInfoForm({ onSave }: AccountInfoFormProps) {
  const [managerName, setManagerName] = useState(SAMPLE_ACCOUNT.managerName)
  const [managerPhone, setManagerPhone] = useState(SAMPLE_ACCOUNT.managerPhone)
  const [contactEmail, setContactEmail] = useState(SAMPLE_ACCOUNT.contactEmail)

  return (
    <FormSection title="계정 정보">
      <Input
        label="로그인 아이디"
        value={SAMPLE_ACCOUNT.loginEmail}
        disabled
        helperText="로그인 아이디는 바꿀 수 없어요. 바꿔야 하면 운영자에게 문의해 주세요."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="담당자 이름"
          value={managerName}
          onChange={event => setManagerName(event.target.value)}
        />
        <Input
          label="담당자 연락처"
          value={managerPhone}
          inputMode="tel"
          onChange={event => setManagerPhone(event.target.value)}
        />
      </div>
      <Input
        label="알림 받을 메일"
        value={contactEmail}
        inputMode="email"
        helperText="주문/정산 알림이 이 주소로 가요."
        onChange={event => setContactEmail(event.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-text-tertiary">
          가입일 {SAMPLE_ACCOUNT.joinedAt} / 마지막 비밀번호 변경{' '}
          {SAMPLE_ACCOUNT.lastPasswordChangedAt}
        </p>
        <Button variant="primary" size="md" onClick={onSave}>
          계정 정보 저장
        </Button>
      </div>
    </FormSection>
  )
}

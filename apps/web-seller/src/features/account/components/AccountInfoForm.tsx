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
      {/* 플랫폼에 주문·정산을 셀러에게 알리는 발송 경로가 없다(실측 2026-11-03 — 구매자 휴대폰
          인증 코드와 운영팀 문의 통지 메일뿐이다). "이 주소로 가요"를 남겨 두면 셀러가 주소를
          적어 두고 오지 않는 알림을 기다린다. 입점 심사 화면의 "따로 알림이 가지 않으니 이 화면에서
          결과를 확인해 주세요"와 같은 결로 적는다. */}
      <Input
        label="알림 받을 메일"
        value={contactEmail}
        inputMode="email"
        helperText="지금은 주문/정산 알림이 이 주소로 가지 않아요. 주문과 정산은 각 화면에서 확인해 주세요."
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

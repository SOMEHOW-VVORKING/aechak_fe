import { Check, Lock } from 'lucide-react'
import type { SellerApplication, SellerLegalType } from '@aechak/domain'
import { FormSection, Input, SegmentedControl, Select, StatusPill } from '@aechak/design-system/web'
import { BANK_OPTIONS, LEGAL_TYPE_OPTIONS } from '../store-settings.queries'

interface StoreSettingsFormProps {
  value: SellerApplication
  onChange: (patch: Partial<SellerApplication>) => void
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="text-label font-medium text-text-primary">
      {children} <span className="text-error-fg">*</span>
    </span>
  )
}

export function StoreSettingsForm({ value, onChange }: StoreSettingsFormProps) {
  const legalType = value.legalType ?? 'individual'

  function handleLegalTypeChange(next: string) {
    const nextLegalType = next as SellerLegalType
    onChange({
      legalType: nextLegalType,
      sellerType: nextLegalType === 'individual' ? 'individual' : 'business',
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <FormSection title="판매자 유형" step={1} stepStatus="done">
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-medium text-text-primary">셀러 유형</span>
          <SegmentedControl
            options={LEGAL_TYPE_OPTIONS}
            value={legalType}
            onChange={handleLegalTypeChange}
            className="max-w-[520px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <RequiredLabel>대표자명</RequiredLabel>
          <Input
            value={value.representativeName ?? ''}
            onChange={e => onChange({ representativeName: e.target.value })}
          />
        </div>
      </FormSection>

      <FormSection title="대표자 · 사업장 정보" step={2} stepStatus="done">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="휴대폰 번호"
            value={value.phone ?? ''}
            disabled
            rightAddon={
              value.phoneVerified ? (
                <StatusPill variant="success" size="sm">
                  <Check className="size-3" />
                  인증됨
                </StatusPill>
              ) : undefined
            }
          />
          <Input
            label="이메일 (소셜 로그인)"
            value={value.email ?? ''}
            disabled
            rightAddon={<Lock className="size-3.5 text-icon-muted" />}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <RequiredLabel>사업장 주소</RequiredLabel>
          <Input
            value={value.businessAddress ?? ''}
            onChange={e => onChange({ businessAddress: e.target.value })}
          />
        </div>
      </FormSection>

      <FormSection title="정산 계좌" step={3} stepStatus="done">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.4fr_1fr]">
          <Select
            label="은행"
            options={BANK_OPTIONS}
            value={value.bankName ?? ''}
            onChange={bankName => onChange({ bankName })}
          />
          <Input
            label="계좌번호"
            value={value.bankAccountNumber ?? ''}
            onChange={e => onChange({ bankAccountNumber: e.target.value })}
            className="tabular-nums"
          />
          <Input
            label="예금주"
            value={value.bankAccountHolder ?? ''}
            onChange={e => onChange({ bankAccountHolder: e.target.value })}
          />
        </div>
      </FormSection>
    </div>
  )
}

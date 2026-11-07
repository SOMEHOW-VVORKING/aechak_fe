import type { SellerLegalType } from '@aechak/domain'
import { FormSection, Input, SegmentedControl, Select } from '@aechak/design-system/web'
import { Field } from '@/shared/components/Field'
import { BANK_OPTIONS, LEGAL_TYPE_OPTIONS } from '../store-settings.queries'
import type { SellerApplicationFormValue } from '../store-settings.contract'

interface StoreSettingsFormProps {
  value: SellerApplicationFormValue
  onChange: (patch: Partial<SellerApplicationFormValue>) => void
  /** 서버에 저장된 계좌의 마스킹 표시(있으면 재입력 안내를 붙인다 — 응답에 평문이 없다). */
  accountNumberMasked?: string
}

// 입점 신청 폼 — 필드 구성은 BE SaveDraftRequest와 1:1이다(휴대폰/이메일/주소는 BE 계약에
// 없어 폼에서 제외 — 휴대폰 점유 인증은 유저 도메인 선행 조건으로 서버가 저장 시점에 검사).
export function StoreSettingsForm({ value, onChange, accountNumberMasked }: StoreSettingsFormProps) {
  const isBusiness = value.legalType !== 'individual'
  const isCorporate = value.legalType === 'corporate-business'

  function handleLegalTypeChange(next: string) {
    onChange({ legalType: next as SellerLegalType })
  }

  return (
    <div className="flex flex-col gap-4">
      <FormSection title="판매자 유형" step={1} stepStatus="done">
        <Field label="셀러 유형">
          <SegmentedControl
            options={LEGAL_TYPE_OPTIONS}
            value={value.legalType}
            onChange={handleLegalTypeChange}
            className="max-w-[520px]"
          />
        </Field>
        <Field label="대표자명" htmlFor="store-representative-name" required>
          <Input
            id="store-representative-name"
            value={value.representativeName}
            onChange={e => onChange({ representativeName: e.target.value })}
          />
        </Field>
      </FormSection>

      {isBusiness && (
        <FormSection title="사업자 정보" step={2} stepStatus="done">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="상호명" htmlFor="store-business-name" required>
              <Input
                id="store-business-name"
                value={value.businessName}
                onChange={e => onChange({ businessName: e.target.value })}
              />
            </Field>
            <Field label="사업자등록번호" htmlFor="store-business-reg-no" required>
              <Input
                id="store-business-reg-no"
                value={value.businessRegNo}
                onChange={e => onChange({ businessRegNo: e.target.value })}
                placeholder="000-00-00000"
                className="tabular-nums"
              />
            </Field>
            {isCorporate && (
              <Field label="법인등록번호" htmlFor="store-corp-reg-no" required>
                <Input
                  id="store-corp-reg-no"
                  value={value.corpRegNo}
                  onChange={e => onChange({ corpRegNo: e.target.value })}
                  className="tabular-nums"
                />
              </Field>
            )}
            <Input
              label="통신판매업 신고번호"
              value={value.telesalesNumber}
              onChange={e => onChange({ telesalesNumber: e.target.value })}
              helperText="신고번호는 선택 입력이에요. 통신판매업 신고증 서류는 필수예요."
            />
          </div>
        </FormSection>
      )}

      <FormSection title="정산 계좌" step={isBusiness ? 3 : 2} stepStatus="done">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.4fr_1fr]">
          <Select
            label="은행"
            placeholder="은행 선택"
            options={BANK_OPTIONS}
            value={value.bankCode}
            onChange={bankCode => onChange({ bankCode })}
          />
          <Input
            label="계좌번호"
            value={value.accountNumber}
            onChange={e => onChange({ accountNumber: e.target.value })}
            placeholder={accountNumberMasked ?? "'-' 없이 숫자만 입력"}
            helperText={
              accountNumberMasked
                ? '보안을 위해 계좌번호는 저장할 때마다 다시 입력해야 해요.'
                : undefined
            }
            className="tabular-nums"
          />
          <Input
            label="예금주"
            value={value.accountHolder}
            onChange={e => onChange({ accountHolder: e.target.value })}
          />
        </div>
      </FormSection>
    </div>
  )
}

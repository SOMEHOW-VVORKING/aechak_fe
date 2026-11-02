import { FormSection, Input, Textarea } from '@aechak/design-system/web'
import { Field } from '@/shared/components/Field'
import {
  MAX_BRAND_INTRO_LENGTH,
  MAX_STORE_NAME_LENGTH,
  storeNameError,
  type StoreProfileFormValue,
} from '../store-profile.contract'

interface StoreProfileFormProps {
  value: StoreProfileFormValue
  onChange: (patch: Partial<StoreProfileFormValue>) => void
  disabled?: boolean
}

// 승인 뒤 스토어 설정 폼 — 필드 구성은 BE StoreSettingsUpdateRequest와 1:1이다. 이미지 두 개는
// 업로드 UI가 없어 폼에 없고(키는 contract가 보존한다), 주소 3필드는 배송 정책의 출고지와 같은
// 컬럼이라 한쪽에서 바꾸면 다른 쪽도 바뀐다는 사실을 칸 아래에서 밝힌다.
export function StoreProfileForm({ value, onChange, disabled = false }: StoreProfileFormProps) {
  const nameError = storeNameError(value)

  return (
    <div className="flex flex-col gap-4">
      <FormSection title="스토어 정보">
        <Input
          label="상호(스토어명)"
          value={value.storeName}
          onChange={e => onChange({ storeName: e.target.value })}
          disabled={disabled}
          maxLength={MAX_STORE_NAME_LENGTH}
          state={nameError ? 'error' : 'default'}
          helperText={nameError ?? '구매자에게 보이는 이름이에요.'}
        />
        <Field label="브랜드 소개">
          <Textarea
            aria-label="브랜드 소개"
            value={value.brandIntro}
            onChange={next => onChange({ brandIntro: next })}
            disabled={disabled}
            maxLength={MAX_BRAND_INTRO_LENGTH}
            rows={4}
            placeholder="어떤 상품을 어떻게 만드는지 적어 주세요."
          />
        </Field>
      </FormSection>

      <FormSection title="스토어 주소">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="우편번호"
            value={value.zipCode}
            onChange={e => onChange({ zipCode: e.target.value })}
            disabled={disabled}
            maxLength={10}
            className="tabular-nums"
          />
          <Input
            label="도로명주소"
            value={value.roadAddress}
            onChange={e => onChange({ roadAddress: e.target.value })}
            disabled={disabled}
            maxLength={255}
          />
        </div>
        <Input
          label="상세주소"
          value={value.detailAddress}
          onChange={e => onChange({ detailAddress: e.target.value })}
          disabled={disabled}
          maxLength={255}
          helperText="배송 정책의 출고지 주소와 같은 값이라, 여기서 바꾸면 출고지도 함께 바뀌어요."
        />
      </FormSection>
    </div>
  )
}

import type { ShippingPolicy } from '@aechak/domain'
import { Checkbox, FormSection, Input, NumberInput, Select } from '@aechak/design-system/web'
import { AVG_DISPATCH_DAY_OPTIONS, COURIER_OPTIONS } from '../shipping-policy.queries'

interface ShippingPolicyFormProps {
  value: ShippingPolicy
  onChange: (patch: Partial<ShippingPolicy>) => void
}

function FieldLabel({ children }: { children: string }) {
  return <span className="text-label font-medium text-text-primary">{children}</span>
}

function MoneyField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <NumberInput value={value} onChange={onChange} min={0} step={500} disabled={disabled} />
        <span className="text-body-sm text-text-tertiary">원</span>
      </div>
    </div>
  )
}

export function ShippingPolicyForm({ value, onChange }: ShippingPolicyFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <FormSection title="기본 배송 정책">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="기본 택배사"
            options={COURIER_OPTIONS}
            value={value.defaultCourier}
            onChange={defaultCourier => onChange({ defaultCourier })}
          />
          <MoneyField label="기본 배송비" value={value.baseFee} onChange={baseFee => onChange({ baseFee })} />
          <MoneyField
            label="무료배송 기준 금액"
            value={value.freeShippingThreshold}
            onChange={freeShippingThreshold => onChange({ freeShippingThreshold })}
          />
        </div>
      </FormSection>

      <FormSection title="출고지 / 반품지">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="출고지 주소"
            value={value.originAddress}
            onChange={e => onChange({ originAddress: e.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <FieldLabel>반품지 주소</FieldLabel>
              <Checkbox
                label="출고지와 동일"
                checked={value.sameAsOrigin}
                onChange={sameAsOrigin => onChange({ sameAsOrigin })}
              />
            </div>
            <Input
              value={value.sameAsOrigin ? value.originAddress : value.returnAddress}
              disabled={value.sameAsOrigin}
              onChange={e => onChange({ returnAddress: e.target.value })}
            />
          </div>
          <MoneyField
            label="제주 추가 배송비"
            value={value.jejuExtraFee}
            onChange={jejuExtraFee => onChange({ jejuExtraFee })}
          />
          <MoneyField
            label="도서산간 추가 배송비"
            value={value.remoteAreaExtraFee}
            onChange={remoteAreaExtraFee => onChange({ remoteAreaExtraFee })}
          />
          <MoneyField label="반품 배송비" value={value.returnFee} onChange={returnFee => onChange({ returnFee })} />
          <MoneyField
            label="교환 배송비 (왕복)"
            value={value.exchangeFee}
            onChange={exchangeFee => onChange({ exchangeFee })}
          />
          <Select
            label="평균 발송 소요일"
            options={AVG_DISPATCH_DAY_OPTIONS}
            value={String(value.avgDispatchDays)}
            onChange={avgDispatchDays => onChange({ avgDispatchDays: Number(avgDispatchDays) })}
          />
        </div>
      </FormSection>
    </div>
  )
}

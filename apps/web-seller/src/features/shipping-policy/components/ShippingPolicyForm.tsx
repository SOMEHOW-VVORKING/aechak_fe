import type { ShippingPolicy } from '@aechak/domain'
import { Alert, Checkbox, FormSection, Input, NumberInput, Select } from '@aechak/design-system/web'
import { Field } from '@/shared/components/Field'
import { COURIER_LOAD_ERROR_MESSAGE, courierSelectOptions, useCouriers } from '@/shared/couriers'
import { AVG_DISPATCH_DAY_OPTIONS } from '../shipping-policy.queries'

interface ShippingPolicyFormProps {
  value: ShippingPolicy
  onChange: (patch: Partial<ShippingPolicy>) => void
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
    <Field label={label}>
      <div className="flex items-center gap-2">
        <NumberInput value={value} onChange={onChange} min={0} step={500} disabled={disabled} />
        <span className="text-body-sm text-text-tertiary">원</span>
      </div>
    </Field>
  )
}

export function ShippingPolicyForm({ value, onChange }: ShippingPolicyFormProps) {
  // 택배사는 서버 마스터가 정본이다 — 코드를 그대로 저장해야 저장 시 404/50303이 나지 않는다.
  const couriers = useCouriers()
  return (
    <div className="flex flex-col gap-4">
      {/* 조회 실패 시 하드코딩 폴백을 부활시키지 않는다 — 고를 수 없는 이유를 그대로 알린다. */}
      {couriers.isError && <Alert variant="error">{COURIER_LOAD_ERROR_MESSAGE}</Alert>}
      <FormSection title="기본 배송 정책">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="기본 택배사"
            placeholder={couriers.isPending ? '불러오는 중' : '선택'}
            options={courierSelectOptions(couriers.data)}
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
          <Field
            label="반품지 주소"
            trailing={
              <Checkbox
                label="출고지와 동일"
                checked={value.sameAsOrigin}
                onChange={sameAsOrigin => onChange({ sameAsOrigin })}
              />
            }
          >
            <Input
              value={value.sameAsOrigin ? value.originAddress : value.returnAddress}
              disabled={value.sameAsOrigin}
              onChange={e => onChange({ returnAddress: e.target.value })}
            />
          </Field>
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

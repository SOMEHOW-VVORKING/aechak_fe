import { Alert, Checkbox, FormSection, Input, NumberInput, Select, Textarea } from '@aechak/design-system/web'
import { Field, FieldError } from '@/shared/components/Field'
import { COURIER_LOAD_ERROR_MESSAGE, courierSelectOptions, useCouriers } from '@/shared/couriers'
import {
  AVG_DISPATCH_DAY_OPTIONS,
  FREE_SHIPPING_FALLBACK_THRESHOLD,
  MAX_FREE_SHIPPING_THRESHOLD,
  MAX_SHIPPING_FEE,
  freeShippingThresholdError,
  type ShippingPolicyFormValue,
} from '../shipping-policy.contract'

interface ShippingPolicyFormProps {
  value: ShippingPolicyFormValue
  onChange: (patch: Partial<ShippingPolicyFormValue>) => void
}

function MoneyField({
  label,
  value,
  onChange,
  max = MAX_SHIPPING_FEE,
  disabled,
  error,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
  disabled?: boolean
  error?: string | null
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <NumberInput value={value} onChange={onChange} min={0} max={max} step={500} disabled={disabled} />
        <span className="text-body-sm text-text-tertiary">원</span>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

/**
 * 주소 3필드 한 묶음. 서버가 우편번호·도로명·상세를 따로 들고 있어(스토어 설정과 같은 컬럼)
 * 화면도 한 줄 문자열로 합치지 않는다 — 합치면 저장할 때 어느 칸으로 갈지 FE가 지어내야 한다.
 */
function AddressFields({
  idPrefix,
  zipCode,
  roadAddress,
  detailAddress,
  disabled,
  onChange,
}: {
  idPrefix: string
  zipCode: string
  roadAddress: string
  detailAddress: string
  disabled?: boolean
  onChange: (patch: { zipCode?: string; roadAddress?: string; detailAddress?: string }) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        id={`${idPrefix}-zip`}
        label="우편번호"
        value={zipCode}
        maxLength={10}
        disabled={disabled}
        onChange={e => onChange({ zipCode: e.target.value })}
      />
      <Input
        id={`${idPrefix}-road`}
        label="도로명주소"
        value={roadAddress}
        maxLength={255}
        disabled={disabled}
        onChange={e => onChange({ roadAddress: e.target.value })}
      />
      <Input
        id={`${idPrefix}-detail`}
        label="상세주소"
        value={detailAddress}
        maxLength={255}
        disabled={disabled}
        onChange={e => onChange({ detailAddress: e.target.value })}
      />
    </div>
  )
}

export function ShippingPolicyForm({ value, onChange }: ShippingPolicyFormProps) {
  // 택배사는 서버 마스터가 정본이다 — 코드를 그대로 저장해야 저장 시 404/50303이 나지 않는다.
  const couriers = useCouriers()
  const thresholdError = freeShippingThresholdError(value)

  return (
    <div className="flex flex-col gap-4">
      {/* 조회 실패 시 하드코딩 폴백을 부활시키지 않는다 — 고를 수 없는 이유를 그대로 알린다. */}
      {couriers.isError && <Alert variant="error">{COURIER_LOAD_ERROR_MESSAGE}</Alert>}
      <FormSection title="기본 배송 정책">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="기본 택배사"
            placeholder={couriers.isPending ? '불러오는 중' : '선택 안 함'}
            options={courierSelectOptions(couriers.data)}
            value={value.defaultCourierCode}
            onChange={defaultCourierCode => onChange({ defaultCourierCode })}
          />
          <MoneyField
            label="기본 배송비"
            value={value.baseShippingFee}
            onChange={baseShippingFee => onChange({ baseShippingFee })}
          />
          {/* 서버에서 null(미운영)과 0원이 다른 뜻이라 스위치를 따로 둔다. */}
          <Field
            label="무료배송 기준 금액"
            trailing={
              <Checkbox
                label="무료배송 운영"
                checked={value.freeShipping}
                onChange={freeShipping =>
                  onChange({
                    freeShipping,
                    freeShippingThreshold: Math.max(
                      value.freeShippingThreshold,
                      value.baseShippingFee,
                      freeShipping ? FREE_SHIPPING_FALLBACK_THRESHOLD : 0,
                    ),
                  })
                }
              />
            }
          >
            <div className="flex items-center gap-2">
              <NumberInput
                value={value.freeShippingThreshold}
                onChange={freeShippingThreshold => onChange({ freeShippingThreshold })}
                min={0}
                max={MAX_FREE_SHIPPING_THRESHOLD}
                step={1000}
                disabled={!value.freeShipping}
              />
              <span className="text-body-sm text-text-tertiary">원</span>
            </div>
            {value.freeShipping ? (
              thresholdError && <FieldError>{thresholdError}</FieldError>
            ) : (
              <p className="text-caption text-text-tertiary">무료배송을 운영하지 않아요.</p>
            )}
          </Field>
        </div>
      </FormSection>

      <FormSection title="출고지 / 반품지">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="출고지 주소">
            <AddressFields
              idPrefix="origin"
              zipCode={value.originZipCode}
              roadAddress={value.originRoadAddress}
              detailAddress={value.originDetailAddress}
              onChange={patch =>
                onChange({
                  ...(patch.zipCode !== undefined && { originZipCode: patch.zipCode }),
                  ...(patch.roadAddress !== undefined && { originRoadAddress: patch.roadAddress }),
                  ...(patch.detailAddress !== undefined && { originDetailAddress: patch.detailAddress }),
                })
              }
            />
          </Field>
          <Field
            label="반품지 주소"
            trailing={
              <Checkbox
                label="출고지와 동일"
                checked={value.returnSameAsOrigin}
                onChange={returnSameAsOrigin => onChange({ returnSameAsOrigin })}
              />
            }
          >
            <AddressFields
              idPrefix="return"
              zipCode={value.returnSameAsOrigin ? value.originZipCode : value.returnZipCode}
              roadAddress={value.returnSameAsOrigin ? value.originRoadAddress : value.returnRoadAddress}
              detailAddress={
                value.returnSameAsOrigin ? value.originDetailAddress : value.returnDetailAddress
              }
              disabled={value.returnSameAsOrigin}
              onChange={patch =>
                onChange({
                  ...(patch.zipCode !== undefined && { returnZipCode: patch.zipCode }),
                  ...(patch.roadAddress !== undefined && { returnRoadAddress: patch.roadAddress }),
                  ...(patch.detailAddress !== undefined && { returnDetailAddress: patch.detailAddress }),
                })
              }
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="추가 배송비 / 발송">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <FormSection title="배송 정책 안내문">
        <Textarea
          label="상품 상세에 함께 보여줄 안내"
          value={value.shippingPolicyText}
          maxLength={2000}
          rows={4}
          helperText="비워 두면 안내문을 보여주지 않아요."
          onChange={shippingPolicyText => onChange({ shippingPolicyText })}
        />
      </FormSection>
    </div>
  )
}

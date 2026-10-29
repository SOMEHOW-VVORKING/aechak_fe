import { useState } from 'react'
import { Button, DatePicker, FormSection, Input, Select } from '@aechak/design-system/web'
import { COUPON_DISCOUNT_TYPE_LABEL, SAMPLE_COUPON_SCOPES, type CouponDiscountType } from '../coupons.mock'

interface CouponCreateFormProps {
  onCancel: () => void
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onSubmit: () => void
}

const DISCOUNT_TYPE_OPTIONS = (
  Object.entries(COUPON_DISCOUNT_TYPE_LABEL) as [CouponDiscountType, string][]
).map(([value, label]) => ({ value, label }))

// 상품 등록 폼과 같은 패턴(FormSection + DS 입력 컴포넌트) — 새 폼 프리미티브를 만들지 않는다.
export function CouponCreateForm({ onCancel, onSubmit }: CouponCreateFormProps) {
  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState<CouponDiscountType>('RATE')
  const [discountValue, setDiscountValue] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [minOrderAmount, setMinOrderAmount] = useState('')
  const [scope, setScope] = useState('ALL')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [issueLimit, setIssueLimit] = useState('')

  const canSubmit = name.trim() !== '' && discountValue.trim() !== '' && startAt !== '' && endAt !== ''

  return (
    <FormSection title="쿠폰 만들기" className="mb-4">
      <Input label="쿠폰명" value={name} placeholder="첫 구매 10% 할인" onChange={event => setName(event.target.value)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="할인 방식"
          options={DISCOUNT_TYPE_OPTIONS}
          value={discountType}
          onChange={value => setDiscountType(value as CouponDiscountType)}
        />
        <Input
          label={discountType === 'RATE' ? '할인율' : '할인 금액'}
          value={discountValue}
          inputMode="numeric"
          rightAddon={discountType === 'RATE' ? '%' : '원'}
          onChange={event => setDiscountValue(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 정액 쿠폰에는 한도 개념이 없어 칸을 아예 띄우지 않는다(비활성 칸은 장식 UI다). */}
        {discountType === 'RATE' && (
          <Input
            label="최대 할인 한도"
            value={maxDiscount}
            inputMode="numeric"
            rightAddon="원"
            helperText="비워 두면 한도가 없어요."
            onChange={event => setMaxDiscount(event.target.value)}
          />
        )}
        <Input
          label="최소 주문금액"
          value={minOrderAmount}
          inputMode="numeric"
          rightAddon="원"
          onChange={event => setMinOrderAmount(event.target.value)}
        />
      </div>

      <Select label="적용 범위" options={SAMPLE_COUPON_SCOPES} value={scope} onChange={setScope} />

      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker label="사용 시작일" value={startAt} max={endAt || undefined} onChange={setStartAt} />
        {/* 시작일 > 종료일을 애초에 못 고르게 서로의 min/max로 묶는다(클레임 화면과 같은 처리). */}
        <DatePicker label="사용 종료일" value={endAt} min={startAt || undefined} onChange={setEndAt} />
      </div>

      <Input
        label="발급 수량"
        value={issueLimit}
        inputMode="numeric"
        rightAddon="장"
        helperText="비워 두면 수량 제한이 없어요."
        onChange={event => setIssueLimit(event.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" size="md" disabled={!canSubmit} onClick={onSubmit}>
          쿠폰 만들기
        </Button>
      </div>
    </FormSection>
  )
}

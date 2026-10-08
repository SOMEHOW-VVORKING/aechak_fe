import { Radio } from '@aechak/design-system/web'

// 사유 선택 라디오 목록(주문 취소/상품 신고 공용) — 테두리 없는 촘촘한 행(gap-0.5 + min-h-10).
// DS Radio가 자체 label을 그리므로 바깥을 또 label로 감싸지 않고 div로만 감싼다.
export function RadioList<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: readonly { value: T; label: string }[]
  value: string
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {options.map(option => (
        <div key={option.value} className="flex min-h-10 items-center">
          <Radio
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            label={option.label}
          />
        </div>
      ))}
    </div>
  )
}

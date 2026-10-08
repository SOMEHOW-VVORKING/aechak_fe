import { Radio } from '@aechak/design-system/web'

export interface DecisionOption<V extends string = string> {
  value: V
  label: string
  caption?: string
}

interface DecisionRadioGroupProps<V extends string> {
  name: string
  options: DecisionOption<V>[]
  value: V
  onChange: (value: V) => void
}

/**
 * 심사/제재 결정 라디오 카드 목록 — b9-st-2/3/4/5/6 드로어에 반복되는
 * "결정 옵션 + 부제목" 패턴. Radio 자체가 <label>로 렌더링되므로(디자인
 * 시스템), 바깥 행을 또 <label>로 감싸면 Checkbox와 같은 중첩 라벨
 * 토글 상쇄 버그가 날 수 있어 <div onClick>으로만 감쌌다.
 * 값 타입은 호출부의 결정 유니온(V)을 그대로 통과시켜 setState에 바로 넘길 수 있다.
 */
export function DecisionRadioGroup<V extends string>({
  name,
  options,
  value,
  onChange,
}: DecisionRadioGroupProps<V>) {
  return (
    <div className="space-y-2">
      {options.map(option => {
        const selected = value === option.value
        return (
          <div
            key={option.value}
            onClick={() => onChange(option.value)}
            className={[
              'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors',
              selected ? 'border-brand bg-brand-subtle' : 'border-border-subtle hover:bg-surface-hover',
            ].join(' ')}
          >
            <Radio
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-text-primary">{option.label}</p>
              {option.caption && (
                <p className="text-caption text-text-tertiary">{option.caption}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

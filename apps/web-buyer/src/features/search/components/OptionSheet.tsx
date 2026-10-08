import { Check } from 'lucide-react'
import { BottomSheet } from '@aechak/design-system/web'

export interface SheetOption {
  label: string
  selected: boolean
  onSelect: () => void
}

// 단일 선택 옵션 시트(검색 결과의 정렬/가격대). 선택 즉시 적용하고 닫는 것은 onSelect를 넘기는 쪽이 한다.
export function OptionSheet({
  open,
  onClose,
  title,
  options,
}: {
  open: boolean
  onClose: () => void
  title: string
  options: SheetOption[]
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col">
        {options.map(option => (
          <button
            key={option.label}
            type="button"
            onClick={option.onSelect}
            className={[
              'flex h-12 items-center justify-between text-body',
              option.selected ? 'font-semibold text-brand' : 'text-text-primary',
            ].join(' ')}
          >
            {option.label}
            {option.selected && <Check className="size-4 text-brand" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

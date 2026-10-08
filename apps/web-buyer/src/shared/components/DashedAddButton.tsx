import { Plus } from 'lucide-react'

// 목록 끝의 점선 테두리 추가 버튼(펫 프로필/배송지 목록 공용). 높이는 호출부가 className으로 준다.
export function DashedAddButton({
  label,
  onClick,
  className,
}: {
  label: string
  onClick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-card border border-dashed border-border-strong bg-surface-sunken text-body-sm text-text-secondary ${className}`}
    >
      <Plus className="size-[18px]" />
      {label}
    </button>
  )
}

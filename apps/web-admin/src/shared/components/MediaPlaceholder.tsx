import type { ReactNode } from 'react'

/** 이미지/서류 자리 표시 상자(sunken 배경 + muted 아이콘). 크기와 추가 레이아웃은 className으로 준다. */
export function MediaPlaceholder({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-md bg-surface-sunken text-icon-muted ${className}`}
    >
      {children}
    </div>
  )
}

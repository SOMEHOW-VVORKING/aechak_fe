import type { ComponentProps } from 'react'
import { EmptyState } from '@aechak/design-system/web'

// MobileScreen 콘텐츠 영역 세로 중앙에 두는 DS EmptyState(없음/오류 전체 화면용). props는 EmptyState 그대로.
export function ScreenEmptyState(props: ComponentProps<typeof EmptyState>) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState {...props} />
    </div>
  )
}

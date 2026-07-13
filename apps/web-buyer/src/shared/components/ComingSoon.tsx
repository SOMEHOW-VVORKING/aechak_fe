import { EmptyState } from '@aechak/design-system/web'
import type { ReactNode } from 'react'

interface ComingSoonProps {
  title?: string
  description?: string
  icon?: ReactNode
}

// MVP에서 컷된 탭(SNS/채팅)의 "준비 중" 안내. 탭바 5탭 구조는 유지하되 자리만 채우는 화면.
// 부모 `_tabs.tsx`가 이미 `MobileScreen`으로 감싸므로 여기서 다시 감싸지 않고,
// 스크롤 콘텐츠 영역을 꽉 채우는 중앙 정렬 `EmptyState`만 렌더링한다.
export function ComingSoon({
  title = '준비 중이에요',
  description = '더 나은 모습으로 곧 찾아올게요.',
  icon,
}: ComingSoonProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { MyPageHubScreen } from '@/features/mypage'

// 마이페이지 허브(b10-st-1). _tabs 레이아웃의 자식이라 하단 탭바를 유지한다.
export const Route = createFileRoute('/_tabs/mypage')({
  component: MyPageHubScreen,
})

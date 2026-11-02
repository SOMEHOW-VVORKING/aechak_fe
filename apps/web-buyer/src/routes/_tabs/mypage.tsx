import { createFileRoute } from '@tanstack/react-router'
import { MyPageHubScreen } from '@/features/mypage'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 마이페이지 허브(b10-st-1). _tabs 레이아웃의 자식이라 하단 탭바를 유지한다.
export const Route = createFileRoute('/_tabs/mypage')({
  component: MyPageRoute,
})

// 내 정보는 회원 전용(GET /users/me 비로그인 401)이다. _tabs의 MobileScreen 안이라 로그인 안내도
// 앱바 없이 내용만 그린다(허브 화면과 같은 결).
function MyPageRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="mypage" embedded />
  return <MyPageHubScreen />
}

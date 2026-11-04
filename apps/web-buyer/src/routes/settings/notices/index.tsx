import { createFileRoute } from '@tanstack/react-router'
import { NoticeListScreen } from '@/features/notices'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 공지사항 목록. 설정 홈 '고객지원' 그룹에서 들어온다 — 공지는 고객지원 성격이고 설정 하위에
// 두면 목록·상세가 같은 뿌리(/settings/notices/*)로 모인다.
export const Route = createFileRoute('/settings/notices/')({
  component: NoticeListRoute,
})

// 공지 목록은 **회원 전용**이다 — BE SecurityConfig의 permitAll 목록에 `/notices`가 없어
// 비로그인은 401/20004다(상품·검색과 달리 열려 있지 않다). 비회원으로 확정된 경우에만 로그인
// 안내를 그린다 — 'unknown'(세션 확인 실패)은 화면에 맡겨 조회 실패를 그대로 보이게 한다.
function NoticeListRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="notice" />
  return <NoticeListScreen />
}

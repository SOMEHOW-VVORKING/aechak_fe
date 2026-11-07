import { createFileRoute } from '@tanstack/react-router'
import { SnsRelationsScreen } from '@/features/sns'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 차단/뮤트 관리(b7-st-8). 마이 메뉴에서 들어온다. 회원 전용(GET /sns/me/blocks 비로그인 401)이라 비회원으로 확정되면
// 요청 전에 로그인 안내를 그린다.
export const Route = createFileRoute('/mypage/sns-relations')({
  component: SnsRelationsRoute,
})

function SnsRelationsRoute() {
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="snsRelations" />
  return <SnsRelationsScreen />
}

import { createFileRoute } from '@tanstack/react-router'
import { SnsProfileScreen, snsProfileSearch } from '@/features/sns'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 내 SNS 프로필(b7-st-4, GET /sns/me). 마이 메뉴의 내 SNS 프로필 행에서 들어온다(R3-02). 탭은 search로 들고 있어
// 상세에서 돌아와도 유지된다. 회원 전용(GET /sns/me 비로그인 401)이라 비회원으로 확정되면 요청 전에 로그인 안내를 그린다.
export const Route = createFileRoute('/sns/me')({
  validateSearch: snsProfileSearch,
  component: MySnsProfileRoute,
})

function MySnsProfileRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="snsMe" />
  return <SnsProfileScreen tab={tab} onTabChange={next => navigate({ search: { tab: next }, replace: true })} />
}

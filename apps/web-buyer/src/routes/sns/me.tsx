import { createFileRoute } from '@tanstack/react-router'
import { SnsProfileScreen, snsProfileSearch } from '@/features/sns'

// 내 SNS 프로필(b7-st-4, GET /sns/me). 마이 메뉴의 내 SNS 프로필 행에서 들어온다(R3-02). 탭은 search로 들고 있어
// 상세에서 돌아와도 유지된다.
export const Route = createFileRoute('/sns/me')({
  validateSearch: snsProfileSearch,
  component: MySnsProfileRoute,
})

function MySnsProfileRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <SnsProfileScreen tab={tab} onTabChange={next => navigate({ search: { tab: next }, replace: true })} />
}

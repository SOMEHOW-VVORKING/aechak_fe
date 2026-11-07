import { createFileRoute } from '@tanstack/react-router'
import { MobileScreen } from '@aechak/design-system/web'
import { SnsFeedScreen, snsFeedSearch } from '@/features/sns'

// SNS 피드(b7-st-1). 하단 SNS 탭은 SNS 공개 전(SNS_SERVER_AVAILABLE=false)에 준비 중 안내라서 이 경로가 상수와
// 관계없이 피드를 연다(SNS-01 F1과 같다, dev 확인용). 탭은 search로 들고 있어 새로고침과 뒤로 가기에도 유지된다.
export const Route = createFileRoute('/sns/feed')({
  validateSearch: snsFeedSearch,
  component: SnsFeedRoute,
})

function SnsFeedRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <MobileScreen>
      <SnsFeedScreen tab={tab} onTabChange={next => navigate({ search: { tab: next }, replace: true })} />
    </MobileScreen>
  )
}

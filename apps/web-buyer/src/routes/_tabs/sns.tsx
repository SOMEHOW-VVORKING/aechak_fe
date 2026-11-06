import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { SnsFeedScreen, snsFeedSearch } from '@/features/sns'
import { ComingSoon } from '@/shared/components/ComingSoon'
import { SNS_SERVER_AVAILABLE } from '@/shared/sns-availability'

export const Route = createFileRoute('/_tabs/sns')({
  validateSearch: snsFeedSearch,
  component: SnsScreen,
})

// SNS 공개 전에는 준비 중 안내만 그리고 공개하면 피드(SNS-03)를 그린다. 피드와 작성 라우트(/sns/feed,
// /sns/posts/new)는 상수와 관계없이 동작한다(SNS-01 F1과 같다).
function SnsScreen() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (!SNS_SERVER_AVAILABLE) return <ComingSoon icon={<Users className="size-6" />} />
  return <SnsFeedScreen tab={tab} onTabChange={next => navigate({ search: { tab: next }, replace: true })} />
}

import { createFileRoute } from '@tanstack/react-router'
import { FollowListScreen, type FollowDirection } from '@/features/sns'

// 팔로워/팔로잉 목록(b7-st-5). 탭은 search로 들고 있어 새로고침과 뒤로가기에도 유지된다.
export const Route = createFileRoute('/sns/users/$publicId/follows')({
  validateSearch: (search: Record<string, unknown>): { tab: FollowDirection } => ({
    tab: search['tab'] === 'followings' ? 'followings' : 'followers',
  }),
  component: FollowListRoute,
})

function FollowListRoute() {
  const { publicId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <FollowListScreen
      key={publicId}
      publicId={publicId}
      tab={tab}
      onTabChange={next => navigate({ search: { tab: next }, replace: true })}
    />
  )
}

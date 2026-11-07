import { createFileRoute } from '@tanstack/react-router'
import { SnsHashtagPostsScreen, snsSearchSearch, type SnsSearchSort } from '@/features/sns'

// 해시태그 게시물 목록(b7-st-6 6-D). 비로그인도 연다(A9). 정렬은 search로 들고 있어 로그인 뒤 돌아와도 유지된다.
export const Route = createFileRoute('/sns/hashtags/$name')({
  validateSearch: (search: Record<string, unknown>): { sort?: SnsSearchSort } => {
    const { sort } = snsSearchSearch(search)
    return sort ? { sort } : {}
  },
  component: SnsHashtagRoute,
})

function SnsHashtagRoute() {
  const { name } = Route.useParams()
  const { sort } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SnsHashtagPostsScreen
      name={name}
      sort={sort ?? 'POPULAR'}
      onSortChange={next => navigate({ search: { sort: next }, replace: true })}
    />
  )
}

import { createFileRoute, redirect } from '@tanstack/react-router'
import { SearchResultsScreen } from '@/features/search'

// 검색어는 ?q= 쿼리 파라미터로 받는다. 앞뒤 공백은 여기서 한 번만 잘라 아래(화면·쿼리)는 그대로 쓴다.
export const Route = createFileRoute('/search/results')({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === 'string' ? search.q.trim() : '',
  }),
  beforeLoad: ({ search }) => {
    if (!search.q) throw redirect({ to: '/search', replace: true })
  },
  component: SearchResultsRoute,
})

function SearchResultsRoute() {
  const { q } = Route.useSearch()
  return <SearchResultsScreen query={q} />
}

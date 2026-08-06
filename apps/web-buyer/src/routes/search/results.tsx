import { createFileRoute, redirect } from '@tanstack/react-router'
import { SearchResultsScreen } from '@/features/search'

// 검색어는 ?q= 쿼리 파라미터로 받는다.
export const Route = createFileRoute('/search/results')({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  beforeLoad: ({ search }) => {
    if (!search.q.trim()) throw redirect({ to: '/search', replace: true })
  },
  component: SearchResultsRoute,
})

function SearchResultsRoute() {
  const { q } = Route.useSearch()
  return <SearchResultsScreen query={q} />
}

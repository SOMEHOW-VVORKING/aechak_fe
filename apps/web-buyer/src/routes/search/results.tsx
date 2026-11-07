import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  SearchResultsScreen,
  searchTabSearch,
  useRefreshRecentKeywords,
  type SearchTab,
} from '@/features/search'
import {
  SnsSearchResults,
  SnsSearchSection,
  defaultSnsSearchSegment,
  snsSearchSearch,
  useSnsSearchCount,
  type SnsSearchSegment,
  type SnsSearchSort,
} from '@/features/sns'

export interface SearchResultsSearch {
  q: string
  tab?: Exclude<SearchTab, 'all'>
  seg?: SnsSearchSegment
  sort?: SnsSearchSort
}

// 검색어는 ?q= 쿼리 파라미터로 받는다. 앞뒤 공백은 여기서 한 번만 잘라 아래(화면·쿼리)는 그대로 쓴다.
// 탭(전체/마켓/SNS)과 SNS 세그먼트, 정렬도 주소에 둔다. 로그인 안내 시트는 지금 주소로 돌아오므로 로그인 뒤에도 같은 결과를 연다.
export const Route = createFileRoute('/search/results')({
  validateSearch: (search: Record<string, unknown>): SearchResultsSearch => ({
    q: typeof search.q === 'string' ? search.q.trim() : '',
    ...searchTabSearch(search),
    ...snsSearchSearch(search),
  }),
  beforeLoad: ({ search }) => {
    if (!search.q) throw redirect({ to: '/search', replace: true })
  },
  component: SearchResultsRoute,
})

// 검색 결과 화면은 search feature가, SNS 섹션과 SNS 탭은 sns feature가 그린다. feature끼리 import하지 않으므로 여기서 조립한다.
function SearchResultsRoute() {
  const { q, tab = 'all', seg, sort } = Route.useSearch()
  const navigate = Route.useNavigate()
  const refreshRecent = useRefreshRecentKeywords()
  // SNS 탭 옆 수는 전체 탭 SNS 섹션과 같은 조회다. 마켓 탭에서는 새로 부르지 않는다.
  const snsCount = useSnsSearchCount(q, { enabled: tab !== 'market', onSearched: refreshRecent })

  const openTab = (next: SearchTab, sns: Pick<SearchResultsSearch, 'seg' | 'sort'> = {}) =>
    navigate({ search: { q, ...(next !== 'all' && { tab: next }), ...sns }, replace: true })

  return (
    <SearchResultsScreen
      query={q}
      tab={tab}
      // 탭을 바꿔도 SNS 세그먼트와 정렬은 그대로 둔다.
      onTabChange={next => openTab(next, { seg, sort })}
      snsCount={snsCount}
      snsSection={
        <SnsSearchSection
          keyword={q}
          // 더보기는 검색어가 #으로 시작해도 게시물 세그먼트를 인기순으로 연다(P2).
          onOpen={segment => openTab('sns', { seg: segment })}
          onSearched={refreshRecent}
        />
      }
      snsTab={
        <SnsSearchResults
          keyword={q}
          segment={seg ?? defaultSnsSearchSegment(q)}
          sort={sort ?? 'POPULAR'}
          onSegmentChange={next => openTab('sns', { seg: next, sort })}
          onSortChange={next => openTab('sns', { seg, sort: next })}
          onSearched={refreshRecent}
        />
      }
    />
  )
}

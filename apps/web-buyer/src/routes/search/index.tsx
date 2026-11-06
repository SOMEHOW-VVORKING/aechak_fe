import { createFileRoute } from '@tanstack/react-router'
import { SearchScreen, searchTabSearch } from '@/features/search'

// full-bleed(탭바 없음) — __root에 직접 매달린다. _tabs 자식이 아니므로 하단 탭바가 뜨지 않는다.
// ?tab=은 검색을 연 화면이 정한 결과 탭이다(홈은 전체라 비우고 마켓은 market, SNS는 sns).
export const Route = createFileRoute('/search/')({
  validateSearch: searchTabSearch,
  component: SearchRoute,
})

function SearchRoute() {
  const { tab } = Route.useSearch()
  return <SearchScreen tab={tab} />
}

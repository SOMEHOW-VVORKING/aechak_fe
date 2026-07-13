export { SearchScreen } from './components/SearchScreen'
export { SearchResultsScreen } from './components/SearchResultsScreen'
export { useSearchLanding, useSearchResults } from './search.queries'
export {
  buildSearchLanding,
  buildSearchResults,
  activeFilterCount,
  DEFAULT_FILTERS,
  RESULT_SORTS,
} from './search.mock'
export type {
  SearchLanding,
  SearchResult,
  SearchFilters,
  ResultSort,
  PopularKeyword,
  KeywordTrend,
} from './search.mock'

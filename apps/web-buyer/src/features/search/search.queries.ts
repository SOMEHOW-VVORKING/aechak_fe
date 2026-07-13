import { useQuery } from '@tanstack/react-query'
import {
  fetchSearchLanding,
  fetchSearchResults,
  type ResultSort,
  type SearchFilters,
  type SearchLanding,
  type SearchResult,
} from './search.mock'

export const useSearchLanding = () =>
  useQuery<SearchLanding>({
    queryKey: ['search', 'landing'],
    queryFn: fetchSearchLanding,
  })

export const useSearchResults = (query: string, filters: SearchFilters, sort: ResultSort) =>
  useQuery<SearchResult>({
    queryKey: ['search', 'results', query, filters, sort],
    queryFn: () => fetchSearchResults(query, filters, sort),
  })

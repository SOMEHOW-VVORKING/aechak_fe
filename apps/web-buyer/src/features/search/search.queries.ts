import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAllRecentKeywords,
  deleteRecentKeyword,
  customInstance,
  getCategories,
  searchProducts,
  type ProductKeywordSearchSort,
  type SearchKeywordsEnvelope,
} from '@aechak/api'
import type { CatalogProduct } from '@/shared/catalog'
import { currentSessionEpoch, hydrateLikedFromSummaries, toCatalogProduct } from '@/shared/catalog'
import { PRICE_MAX, type ResultSort, type SearchFilters } from './search.mock'

export interface RecentKeyword {
  id: number
  keyword: string
  searchedAt: string
}

export interface SearchLanding {
  recentKeywords: RecentKeyword[]
  suggestedKeywords: string[]
}

interface SearchPage {
  products: CatalogProduct[]
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}

export interface SearchResult {
  products: CatalogProduct[]
  total: number
}

const landingKey = ['search', 'landing'] as const

const SORT_PARAM: Record<ResultSort, ProductKeywordSearchSort> = {
  popular: 'popular',
  'price-asc': 'price_asc',
  latest: 'latest',
}

export const useSearchLanding = (enabled = true) =>
  useQuery<SearchLanding>({
    queryKey: landingKey,
    queryFn: async ({ signal }) => {
      // refresh cookie가 있으면 일반 보호 API처럼 세션을 복원하되, 진짜 게스트여서
      // refresh까지 실패한 경우에는 검색 화면에서 전역 로그인 이동만 억제한다.
      const response = await customInstance<SearchKeywordsEnvelope>({
        url: '/search/keywords',
        method: 'GET',
        signal,
        suppressAuthExpiredRedirect: true,
      })
      return {
        recentKeywords: response.data.recentKeywords,
        suggestedKeywords: response.data.recommendedKeywords.map(item => item.keyword),
      }
    },
    enabled,
    retry: false,
  })

// 검색 결과 필터의 카테고리 선택지. catalog의 useCategoryTree와 같은 캐시 키를 써 중복 조회를 막는다.
// /categories는 인증 필요라 로그인 사용자만 조회한다(비회원은 카테고리 필터 없이 전체 검색).
export const useSearchCategories = (enabled = true) =>
  useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: ({ signal }) => getCategories(signal),
    select: res => res.data,
    staleTime: Infinity,
    enabled,
  })

export function useDeleteRecentKeyword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteRecentKeyword,
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: landingKey })
      const previous = queryClient.getQueryData<SearchLanding>(landingKey)
      queryClient.setQueryData<SearchLanding>(landingKey, current =>
        current
          ? { ...current, recentKeywords: current.recentKeywords.filter(item => item.id !== id) }
          : current,
      )
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(landingKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: landingKey }),
  })
}

export function useDeleteAllRecentKeywords() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAllRecentKeywords,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: landingKey })
      const previous = queryClient.getQueryData<SearchLanding>(landingKey)
      queryClient.setQueryData<SearchLanding>(landingKey, current =>
        current ? { ...current, recentKeywords: [] } : current,
      )
      return { previous }
    },
    onError: (_error, _variables, context) =>
      queryClient.setQueryData(landingKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: landingKey }),
  })
}

async function fetchSearchPage(
  query: string,
  filters: SearchFilters,
  sort: ResultSort,
  cursor: string | undefined,
  signal: AbortSignal | undefined,
): Promise<SearchPage> {
  // 요청 시작 전 세션 epoch 캡처(catalog와 동일) — 로그아웃을 가로지른 응답의 미러 오염 방지.
  const epoch = currentSessionEpoch()
  const response = await searchProducts(
    {
      keyword: query,
      sort: SORT_PARAM[sort],
      minPrice: filters.minPrice > 0 ? filters.minPrice : undefined,
      maxPrice: filters.maxPrice < PRICE_MAX ? filters.maxPrice : undefined,
      minRating: filters.minRating > 0 ? filters.minRating : undefined,
      freeShipping: filters.freeShippingOnly,
      excludeSoldOut: filters.excludeSoldOut,
      category: filters.category ?? undefined,
      cursor,
      size: 20,
    },
    signal,
  )
  // 로그인 검색이면 카드별 isLiked가 실려 온다 — 카탈로그와 동일하게 미러를 시드해 검색 결과
  // 하트가 첫 렌더부터 정확하다(비로그인 검색은 전부 false라 no-op).
  hydrateLikedFromSummaries(response.data.products, epoch)
  const products = response.data.products.map(toCatalogProduct)
  return { ...response.data, products }
}

function selectSearchResults(data: { pages: SearchPage[] }): SearchResult {
  return {
    products: data.pages.flatMap(page => page.products),
    total: data.pages[0]?.totalCount ?? 0,
  }
}

export const useSearchResults = (query: string, filters: SearchFilters, sort: ResultSort) => {
  const queryClient = useQueryClient()
  return useInfiniteQuery({
    queryKey: ['search', 'results', query, filters, sort],
    queryFn: async ({ pageParam, signal }) => {
      const page = await fetchSearchPage(query, filters, sort, pageParam, signal)
      if (pageParam === undefined) void queryClient.invalidateQueries({ queryKey: landingKey })
      return page
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectSearchResults,
    // 검색어는 라우트(validateSearch)가 이미 trim해 넘긴다. 빈 검색어는 서버(@NotBlankUnicode)보다 앞서 호출하지 않는다.
    enabled: query !== '',
  })
}

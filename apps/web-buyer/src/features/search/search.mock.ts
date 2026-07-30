import { CATALOG_PRODUCTS, isFreeShipping, type CatalogProduct } from '@/shared/catalog'

// ---- 검색 랜딩(b3-st-2) ----

export type KeywordTrend = 'up' | 'flat' | 'down'

export interface PopularKeyword {
  rank: number
  keyword: string
  trend: KeywordTrend
}

export interface SearchLanding {
  recentKeywords: string[]
  suggestedKeywords: string[]
  popularKeywords: PopularKeyword[]
  popularAsOf: string
}

const LANDING: SearchLanding = {
  recentKeywords: ['자동 급식기', '고양이 모래', '츄르', '스크래쳐', '관절 영양제'],
  suggestedKeywords: ['여름 쿨매트', '덴탈껌', '대용량 사료', '캣타워', '방수 패드'],
  popularKeywords: [
    { rank: 1, keyword: '자동 급식기', trend: 'up' },
    { rank: 2, keyword: '고양이 모래 8.5L', trend: 'flat' },
    { rank: 3, keyword: '강아지 사료 연어', trend: 'up' },
    { rank: 4, keyword: '노즈워크 장난감', trend: 'down' },
  ],
  popularAsOf: '06.14 09:00',
}

export function buildSearchLanding(): SearchLanding {
  return LANDING
}

export function fetchSearchLanding(): Promise<SearchLanding> {
  return new Promise(resolve => {
    setTimeout(() => resolve(LANDING), 200)
  })
}

// ---- 검색 결과(b3-st-3) ----

// 무료배송 기준은 shared/catalog가 단일 원본(상세 배송 문구와 동일 규칙 공유). 여기선 재수출만.
export { FREE_SHIPPING_THRESHOLD } from '@/shared/catalog'

export type ResultSort = 'recommend' | 'popular' | 'price-asc'

export interface ResultSortOption {
  value: ResultSort
  label: string
}

export const RESULT_SORTS: ResultSortOption[] = [
  { value: 'recommend', label: '추천순' },
  { value: 'popular', label: '인기순' },
  { value: 'price-asc', label: '낮은 가격순' },
]

export const PRICE_MIN = 0
export const PRICE_MAX = 200000

export interface SearchFilters {
  minPrice: number
  maxPrice: number
  freeShippingOnly: boolean
  excludeSoldOut: boolean
  minRating: number
}

export const DEFAULT_FILTERS: SearchFilters = {
  minPrice: PRICE_MIN,
  maxPrice: PRICE_MAX,
  freeShippingOnly: false,
  excludeSoldOut: true,
  minRating: 0,
}

export interface SearchResult {
  products: CatalogProduct[]
  total: number
  suggestions: string[]
}

// 결과 없음(3-C) 시 제안할 대체 검색어.
const FALLBACK_SUGGESTIONS = ['강아지 의류', '우비', '방한 패딩', '하네스']

function matchesQuery(product: CatalogProduct, query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = `${product.name} ${product.category} ${product.storeName ?? ''}`.toLowerCase()
  return tokens.every(t => haystack.includes(t.toLowerCase()))
}

function applyFilters(product: CatalogProduct, filters: SearchFilters): boolean {
  if (filters.excludeSoldOut && product.isSoldOut) return false
  if (product.price < filters.minPrice || product.price > filters.maxPrice) return false
  if (filters.freeShippingOnly && !isFreeShipping(product)) return false
  if (filters.minRating > 0 && (product.rating ?? 0) < filters.minRating) return false
  return true
}

function sortResults(list: CatalogProduct[], sort: ResultSort): CatalogProduct[] {
  const copy = [...list]
  switch (sort) {
    case 'popular':
      return copy.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price)
    case 'recommend':
    default:
      return copy
  }
}

// 활성 필터 수(필터바 "필터 N" 배지) — 기본값에서 벗어난 항목 수.
// 품절 제외는 기본 on이므로 off로 바꾼 것도 "적용된 필터"로 카운트한다.
export function activeFilterCount(filters: SearchFilters): number {
  let n = 0
  if (filters.minPrice !== DEFAULT_FILTERS.minPrice || filters.maxPrice !== DEFAULT_FILTERS.maxPrice) n += 1
  if (filters.freeShippingOnly) n += 1
  if (filters.excludeSoldOut !== DEFAULT_FILTERS.excludeSoldOut) n += 1
  if (filters.minRating > 0) n += 1
  return n
}

export function buildSearchResults(query: string, filters: SearchFilters, sort: ResultSort): SearchResult {
  const matched = CATALOG_PRODUCTS.filter(p => matchesQuery(p, query) && applyFilters(p, filters))
  const products = sortResults(matched, sort)
  return {
    products,
    total: products.length,
    suggestions: FALLBACK_SUGGESTIONS,
  }
}

export function fetchSearchResults(
  query: string,
  filters: SearchFilters,
  sort: ResultSort,
): Promise<SearchResult> {
  return new Promise(resolve => {
    setTimeout(() => resolve(buildSearchResults(query, filters, sort)), 300)
  })
}

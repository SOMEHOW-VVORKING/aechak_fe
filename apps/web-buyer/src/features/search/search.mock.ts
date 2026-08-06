// 검색 화면의 API 독립 UI 상태와 표시 상수. 서버 응답/필터링 로직은 search.queries.ts가 소유한다.
export type ResultSort = 'popular' | 'price-asc' | 'latest'

export interface ResultSortOption {
  value: ResultSort
  label: string
}

export const RESULT_SORTS: ResultSortOption[] = [
  { value: 'popular', label: '인기순' },
  { value: 'price-asc', label: '낮은 가격순' },
  { value: 'latest', label: '최신순' },
]

export const PRICE_MIN = 0
// 가격 프리셋 UI의 열린 상한 sentinel. 이 값이면 API maxPrice를 생략해 20만원 초과도 포함한다.
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

// 검색 결과 API는 대체 검색어를 반환하지 않아 무결과 UI에만 쓰는 제품 카피다.
export const FALLBACK_SUGGESTIONS = ['강아지 의류', '우비', '방한 패딩', '하네스']

// 활성 필터 수(필터바 "필터 N" 배지) — 기본값에서 벗어난 항목 수.
// 품절 제외는 기본 on이므로 off로 바꾼 것도 "적용된 필터"로 카운트한다.
export function activeFilterCount(filters: SearchFilters): number {
  let n = 0
  if (
    filters.minPrice !== DEFAULT_FILTERS.minPrice ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice
  )
    n += 1
  if (filters.freeShippingOnly) n += 1
  if (filters.excludeSoldOut !== DEFAULT_FILTERS.excludeSoldOut) n += 1
  if (filters.minRating > 0) n += 1
  return n
}

// 마켓 카테고리 체계 — 홈 칩 · 카테고리 탐색(b3-st-1)의 대/중분류 공용 정의.
// 라벨의 구분자는 카피 컨벤션에 따라 가운뎃점(·)이 아니라 '/'를 쓴다(사료/간식 등).

export type MainCategory = 'all' | 'dog' | 'cat' | 'common' | 'brand'

export interface MainCategoryOption {
  value: MainCategory
  label: string
}

export const MAIN_CATEGORIES: MainCategoryOption[] = [
  { value: 'all', label: '전체' },
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
  { value: 'common', label: '공통' },
  { value: 'brand', label: '브랜드관' },
]

// 중분류(서브 카테고리) — 'all'(전체)을 맨 앞에 두고 10종.
export const SUB_CATEGORIES: string[] = [
  '전체',
  '사료/간식',
  '장난감',
  '의류/악세서리',
  '위생/미용',
  '침구/하우스',
  '건강/영양제',
  '산책용품',
  '식기/급수기',
  '이동장/유모차',
  '훈련/행동',
]

// 마켓 정렬 — 서버(GET /products)가 지원하는 2종만 노출한다. 값은 서버 enum(latest/price_asc)과
// 동일해 매핑 계층 없이 그대로 넘긴다. 목업 시절의 '인기순'(popular)은 서버 미지원이라 제거했다.
export type CatalogSort = 'latest' | 'price_asc'

export interface CatalogSortOption {
  value: CatalogSort
  label: string
}

export const CATALOG_SORTS: CatalogSortOption[] = [
  { value: 'latest', label: '최신순' },
  { value: 'price_asc', label: '낮은 가격순' },
]

export function mainCategoryLabel(value: MainCategory): string {
  return MAIN_CATEGORIES.find(c => c.value === value)?.label ?? '전체'
}

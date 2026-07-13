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

export type CatalogSort = 'popular' | 'newest' | 'price-asc'

export interface CatalogSortOption {
  value: CatalogSort
  label: string
}

export const CATALOG_SORTS: CatalogSortOption[] = [
  { value: 'popular', label: '인기순' },
  { value: 'newest', label: '신상품' },
  { value: 'price-asc', label: '낮은가격' },
]

export function mainCategoryLabel(value: MainCategory): string {
  return MAIN_CATEGORIES.find(c => c.value === value)?.label ?? '전체'
}

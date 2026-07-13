import { CATALOG_PRODUCTS, type CatalogProduct, type CatalogSort, type MainCategory } from '@/shared/catalog'

export interface CatalogParams {
  mainCategory: MainCategory
  subCategory: string
  sort: CatalogSort
  /** 품절 상품 제외 여부. 결과 헤더의 "품절 제외" 토글이 이 값을 제어한다. */
  excludeSoldOut: boolean
}

export interface CatalogResult {
  products: CatalogProduct[]
  total: number
}

function sortProducts(list: CatalogProduct[], sort: CatalogSort): CatalogProduct[] {
  const copy = [...list]
  switch (sort) {
    case 'popular':
      return copy.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    case 'newest':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price)
    default:
      return copy
  }
}

// 대분류×중분류 필터 + 정렬. 품절 제외 토글이 켜져 있으면(기본값) 품절 상품을 뺀다 —
// 결과 헤더의 "품절 제외" 토글이 이 동작을 제어한다(검색 결과 화면과 동일한 기본 on).
export function buildCatalog({ mainCategory, subCategory, sort, excludeSoldOut }: CatalogParams): CatalogResult {
  let list = excludeSoldOut ? CATALOG_PRODUCTS.filter(p => !p.isSoldOut) : [...CATALOG_PRODUCTS]
  if (mainCategory !== 'all') {
    list = list.filter(p => p.mainCategory === mainCategory)
  }
  if (subCategory !== '전체') {
    list = list.filter(p => p.category === subCategory)
  }
  const products = sortProducts(list, sort)
  return { products, total: products.length }
}

export function fetchCatalog(params: CatalogParams): Promise<CatalogResult> {
  return new Promise(resolve => {
    setTimeout(() => resolve(buildCatalog(params)), 300)
  })
}

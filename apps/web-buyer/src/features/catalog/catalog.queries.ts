import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getCategories, getProducts } from '@aechak/api'
import type { CatalogProduct, CatalogSort } from '@/shared/catalog'
import { toCatalogProduct } from './catalog.mapper'

// 카테고리 트리(대>중>소). 세션 내 불변이라 staleTime Infinity. enabled로 비회원 트랩을 막는다 —
// /categories는 서버에서 인증 필요라, 로그아웃 상태면 요청 자체를 걸어 401 -> 전역 로그인
// 리다이렉트로 튕기는 걸 피한다(로그인 사용자는 정상 조회, 비회원은 카테고리 필터 없이 전체만).
export function useCategoryTree(enabled: boolean) {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: ({ signal }) => getCategories(signal),
    select: res => res.data,
    staleTime: Infinity,
    enabled,
  })
}

interface ProductPage {
  products: CatalogProduct[]
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}

// 페이지를 fetch당 한 번만 CatalogProduct로 매핑한다. select에서 다시 매핑하지 않도록 완성
// 형태로 반환한다(codex 리뷰 #5 — select 재매핑/참조 불안정 제거). 레지스트리에는 ProductGrid에서
// 상세 진입/찜처럼 후속 화면이 상품 스냅샷을 실제 소비할 때만 등록해 장기 세션 누적을 제한한다.
async function fetchProductPage(
  params: { category?: number; sort: CatalogSort },
  pageParam: string | undefined,
  signal: AbortSignal | undefined,
): Promise<ProductPage> {
  const res = await getProducts(
    { category: params.category, sort: params.sort, cursor: pageParam, size: 20 },
    signal,
  )
  const products = res.data.products.map(toCatalogProduct)
  return {
    products,
    totalCount: res.data.totalCount,
    nextCursor: res.data.nextCursor,
    hasNext: res.data.hasNext,
  }
}

// 모듈 레벨 안정 셀렉터 — 인라인 함수면 렌더마다 재실행돼 그리드가 매번 리렌더된다. identity를
// 고정하면 react-query가 결과를 메모이즈한다(이미 매핑된 페이지를 평탄화만 한다).
function selectProductList(data: { pages: ProductPage[] }) {
  return {
    products: data.pages.flatMap(page => page.products),
    totalCount: data.pages[0]?.totalCount ?? null,
  }
}

// 상품 목록(커서 페이지네이션). category(categoryId)/sort 전환 시 별개 캐시로 처음부터 조회한다.
export function useProductList(params: { category?: number; sort: CatalogSort }) {
  return useInfiniteQuery({
    queryKey: ['catalog', 'products', params.category ?? null, params.sort],
    queryFn: ({ pageParam, signal }) => fetchProductPage(params, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectProductList,
    staleTime: 30_000,
  })
}

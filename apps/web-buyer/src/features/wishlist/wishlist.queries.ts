import { useInfiniteQuery } from '@tanstack/react-query'
import { getLikedProducts } from '@aechak/api'
import {
  currentSessionEpoch,
  hydrateLikedFromSummaries,
  LIKED_PRODUCTS_QUERY_KEY,
  toCatalogProduct,
  type CatalogProduct,
} from '@/shared/catalog'

interface LikedProductPage {
  products: CatalogProduct[]
  nextCursor: string | null
  hasNext: boolean
}

async function fetchLikedPage(
  pageParam: string | undefined,
  signal: AbortSignal | undefined,
): Promise<LikedProductPage> {
  const epoch = currentSessionEpoch()
  const res = await getLikedProducts({ cursor: pageParam, size: 20 }, signal)
  const products = res.data.products.map(toCatalogProduct)
  // 이 페이지의 찜 id만 미러에 머지한다(fetch당 1회, 마켓/검색과 공유하는 헬퍼). 찜 목록은 전부
  // isLiked=true라 사실상 모든 id를 머지하되, 로컬 해제 툼스톤이 있는 id는 스킵돼 방금 해제한
  // 상품이 페이지네이션·리페치로 되살아나지 않는다. epoch로 로그아웃을 가로지른 응답도 무시한다.
  // 하트가 채워지고 화면 필터(pool ∩ id-set)가 이 상품들을 통과시킨다.
  hydrateLikedFromSummaries(res.data.products, epoch)
  return { products, nextCursor: res.data.nextCursor, hasNext: res.data.hasNext }
}

// 모듈 레벨 안정 셀렉터 — 이미 매핑된 페이지를 평탄화만 한다(catalog useProductList 관례).
function selectLikedProducts(data: { pages: LikedProductPage[] }): CatalogProduct[] {
  return data.pages.flatMap(page => page.products)
}

// 내 찜 목록(커서 페이지네이션). 반환값 data는 서버가 준 찜 상품 pool(CatalogProduct[])이다 —
// 화면은 이 pool을 현재 찜 id-set으로 필터해 표시한다(해제 시 즉시 사라지고 실행취소 시 pool에
// 아직 있어 즉시 복귀, 리페치·캐시수술 불필요).
export function useLikedProducts() {
  return useInfiniteQuery({
    queryKey: LIKED_PRODUCTS_QUERY_KEY,
    queryFn: ({ pageParam, signal }) => fetchLikedPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectLikedProducts,
    staleTime: 30_000,
  })
}

import { productsByIds, type CatalogProduct } from '@/shared/catalog'

// 장바구니 담기 확인 시트의 "함께 보면 좋은 상품" 추천 큐레이션. home.mock.ts의 RECOMMENDED_IDS
// 컨벤션을 그대로 따른다 — 기존 20개 카탈로그 상품(CATALOG_PRODUCTS)에서 id만 골라 쓰고(새 Product
// seed 안 만듦), 품절 상품(p-scratcher 등)은 큐레이션에서 뺀다(카드 이동 불가). 순서 = 노출 순서.

// 상품별 override — 대표 급식기 상세는 맥락에 맞는 큐레이션(다른 급식기/캣타워)을 직접 지정한다
// (패턴은 product.mock.ts의 OPTIONS_BY_ID와 동일). 없으면 아래 일반 배열 fallback을 쓴다.
const RECOMMENDATIONS_BY_ID: Record<string, string[]> = {
  'p-feeder-5l': ['p-feeder-6l', 'p-feeder-steel', 'p-feeder-wet', 'p-cattower'],
  'p-feeder-6l': ['p-feeder-5l', 'p-feeder-steel', 'p-feeder-wet', 'p-water-550'],
}

// 일반 fallback — "함께 보면 좋은" 둘러보기 대상. 품절 상품(p-scratcher)을 포함하지 않는다.
const RECOMMENDED_IDS = ['p-feeder-6l', 'p-cattower', 'p-coolmat', 'p-nose-toy', 'p-harness-y', 'p-salmon-food']

// 현재 보고 있는 상품과 품절 상품은 목록에서 제외한다(RECOMMENDED_IDS 컨벤션과 동일 — 품절은 카드
// 이동 불가라 큐레이션에서 빼고, 자기 자신을 추천하지 않는다). productsByIds가 알 수 없는 id를 이미
// 걸러주므로 여기선 현재 상품·품절만 추가로 거른다. product.options처럼 동기 읽기(별도 useQuery
// 불필요). override 맵 + 일반 fallback으로 모든 상품이 목록이 비지 않게 보장한다.
export function getCartRecommendations(productId: string): CatalogProduct[] {
  const ids = RECOMMENDATIONS_BY_ID[productId] ?? RECOMMENDED_IDS
  return productsByIds(ids).filter(p => p.id !== productId && !p.isSoldOut)
}

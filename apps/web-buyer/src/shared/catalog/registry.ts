import type { CatalogProduct } from './products'

// 실 API로 불러온 상품의 클라이언트 캐시. 실 ULID 상품이 목업 기반 장바구니/주문 흐름
// (buildCartView/buildOrderFromContext가 findProduct로 상품을 재조회)에서도 해석되게, 목록/상세
// 후속 화면이 상품 스냅샷을 실제 소비할 때 여기에 등록한다. 목록의 모든 조회 결과를 등록하면
// 장기 WebView/SPA 세션에서 Map이 단조 증가하므로 ProductGrid의 상세 진입·찜, 상품 상세처럼
// 필요한 상품만 넣는다. 반응형 스토어가 아니라 순수 Map이며 id로 set이라 멱등이다.
const REGISTRY = new Map<string, CatalogProduct>()

/** 실 상품을 캐시에 등록(멱등). 같은 id면 최신 값으로 덮는다. */
export function registerProducts(products: readonly CatalogProduct[]): void {
  for (const product of products) REGISTRY.set(product.id, product)
}

/** id로 등록된 실 상품을 조회. findProduct가 목업보다 먼저 이 캐시를 본다. */
export function getRegistered(id: string): CatalogProduct | undefined {
  return REGISTRY.get(id)
}

/** 테스트 격리용 — 캐시를 비운다. */
export function resetRegistry(): void {
  REGISTRY.clear()
}

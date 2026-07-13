import { productsByIds, useWishedIds, type CatalogProduct } from '@/shared/catalog'

// 찜 목록 = 전역 찜 스토어(클라이언트 상태)의 id들을 공용 카탈로그에서 조회한 상품 목록.
// 서버 상태가 아니라 스토어 파생값이라 TanStack Query 대신 스토어 구독 셀렉터 훅으로 둔다.
export function useWishlistProducts(): CatalogProduct[] {
  const ids = useWishedIds()
  return productsByIds([...ids])
}

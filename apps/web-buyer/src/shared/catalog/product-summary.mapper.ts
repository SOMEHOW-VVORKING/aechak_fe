import type { ProductSummaryResponse, SaleStatus } from '@aechak/api'
import type { ProductSaleStatus } from '@aechak/domain'
import { mediaUrl } from './media'
import type { CatalogProduct } from './products'

// 서버 saleStatus -> 도메인 Product.status(목업 make()가 쓰는 값과 동일 어휘).
const SALE_STATUS: Record<SaleStatus, ProductSaleStatus> = {
  ON_SALE: 'selling',
  OUT_OF_STOCK: 'sold_out',
  SUSPENDED: 'suspended',
  ENDED: 'ended',
}

// 썸네일 placeholder 색 구분용 — productId에서 결정적 tone(0~359)을 파생한다(실이미지 base가
// 설정되면 mediaUrl이 tone을 무시하고 실 URL을 쓴다).
function toneFromId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360
  return hash
}

// 상품 목록 요약(ProductSummaryResponse) -> 공용 CatalogProduct. 마켓/검색/찜 목록이 공유한다
// — 원래 features/catalog에 있었으나 찜 목록(features/wishlist)도 같은 매핑이 필요해 shared로
// 승격했다(feature->feature import 회피). CatalogProduct/mediaUrl은 배럴 자기참조 사이클을 피해
// 상대경로로 가져온다. 도메인 Product 필수 필드는 표시에 안전한 값으로 채운다. 정렬은 서버가
// 하므로 createdAt은 미사용, 정확 재고/카테고리 라벨은 요약 응답에 없어 상세/옵션에서 보강한다.
// sellerId를 목업과 같은 `seller-<이름>` 형태로 맞춰 실/목업 상품 모두에서 장바구니 셀러
// 그룹핑이 일관되게 동작한다.
export function toCatalogProduct(p: ProductSummaryResponse): CatalogProduct {
  const isSoldOut = p.saleStatus !== 'ON_SALE'
  return {
    id: p.productId,
    sellerId: `seller-${p.sellerName}`,
    code: p.productId,
    name: p.name,
    category: '',
    price: p.discountPrice ?? p.regularPrice,
    stock: isSoldOut ? 0 : 99,
    status: SALE_STATUS[p.saleStatus],
    inspectionStatus: 'approved',
    createdAt: '',
    originalPrice: p.discountPrice != null ? p.regularPrice : undefined,
    storeName: p.sellerName,
    thumbnailUrl: mediaUrl(p.thumbnailImageKey, toneFromId(p.productId)),
    rating: p.averageRating ?? undefined,
    reviewCount: p.reviewCount,
    isSoldOut,
    mainCategory: 'all',
  }
}

// 구매자 화면 공용 카탈로그 원본 + 찜 스토어 배럴.
// feature 간 직접 import가 금지이므로, 여러 화면이 공유하는 상품 데이터/찜 상태는 여기서 읽는다.
export { placeholderImage } from './placeholder'
export { mediaUrl } from './media'
export { registerProducts, getRegistered, resetRegistry } from './registry'
export { MAIN_CATEGORIES, SUB_CATEGORIES, CATALOG_SORTS, mainCategoryLabel } from './categories'
export type { MainCategory, MainCategoryOption, CatalogSort, CatalogSortOption } from './categories'
export {
  CATALOG_PRODUCTS,
  findProduct,
  findMockProduct,
  productsByIds,
  FREE_SHIPPING_THRESHOLD,
  BASE_SHIPPING_FEE,
  isFreeShipping,
} from './products'
export type { CatalogProduct } from './products'
export { toCatalogProduct } from './product-summary.mapper'
export { buildCartView } from './cart-view'
export type { CartView, CartSellerGroup, CartLineView } from './cart-view'
export { ProductGrid } from './ProductGrid'
export type { ProductGridProps } from './ProductGrid'
export { ProductCarousel } from './ProductCarousel'
export type { ProductCarouselProps } from './ProductCarousel'
export { ProductThumbnail } from './ProductThumbnail'
export { ProductLineRow, OrderItemsCard } from './ProductLineRow'
export type { OrderLineItem } from './ProductLineRow'
export {
  toggleWishlist,
  onWishlistLogout,
  resetWishlistState,
  hydrateLikedFromSummaries,
  hydrateLikedFromDetail,
  currentSessionEpoch,
  LIKED_PRODUCTS_QUERY_KEY,
} from './wishlist.queries'
export {
  isWished,
  addWish,
  removeWish,
  hydrateWished,
  resetWishlist,
  useWishedIds,
  useIsWished,
} from './wishlist.store'

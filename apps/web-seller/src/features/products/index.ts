// feature 밖(라우트)에서 실제로 쓰는 것만 공개한다. 진입점이 없는 구현은 모듈에 남겨 두되 배럴에서는
// 뺀다 — public API에 남아 있으면 다음 사람이 살아 있는 기능으로 읽는다.
//
// 뺀 것: uploadProductImage / DEFAULT_PAGE_SIZE / normalizeSearchParams — 전부 feature 내부 모듈과
// 테스트가 상대 경로로 쓰고 있어 동작은 그대로다.
// 임시저장(useProductDrafts·useSaveProductDraft·useDeleteProductDraft·DraftListDrawer·toDraftRequest)은
// `/sellers/me/product-drafts`가 생겨 되살렸다.
export {
  useProducts,
  useProductOptions,
  useProductCategories,
  useUpdateProduct,
  useChangeSaleStatus,
  useChangeOptionCombination,
  useProductDetail,
  useDeleteProductDraft,
  useProductDraft,
  useProductDrafts,
  useRegisterProduct,
  useSaveProductDraft,
  productImageUrl,
  type SellerProductSearchInput,
} from './products.queries'
export {
  INSPECTION_STATUS_LABEL,
  KEYWORD_MAX,
  SALE_STATUS_LABEL,
  emptyProductForm,
  isProductDraftMissing,
  productErrorMessage,
  toDraftRequest,
  toFormValues,
  toRegisterRequest,
  toUpdateRequest,
  type CategoryNode,
  type SellerAssignableSaleStatus,
  type SellerProductSearchParams,
  type SellerProductSort,
  type SellerProductStockFilter,
  type ProductDraftSummary,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from './products.contract'
export { InspectionDrawer } from './components/InspectionDrawer'
export { DraftListDrawer, draftLabel } from './components/DraftListDrawer'
export { InventoryDrawer } from './components/InventoryDrawer'
export { ProductEditor } from './components/ProductEditor'
export { ProductMissing } from './components/ProductMissing'

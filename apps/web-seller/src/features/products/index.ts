// feature 밖(라우트)에서 실제로 쓰는 것만 공개한다. 임시저장 훅·초안 Drawer·업로드 함수처럼
// BE 미지원으로 진입점을 막아 둔 구현은 모듈에 그대로 남겨 두되 배럴에서는 뺐다 — public API에
// 남아 있으면 다음 사람이 살아 있는 기능으로 읽는다. 되살릴 때는 여기부터 다시 열면 된다.
//
// 뺀 것: useProductDrafts / useSaveProductDraft / DraftListDrawer / uploadProductImage /
// DEFAULT_PAGE_SIZE / toDraftRequest / normalizeSearchParams — 전부 feature 내부 모듈과 테스트가
// 상대 경로로 쓰고 있어 동작은 그대로다.
export {
  useProducts,
  useProductOptions,
  useProductCategories,
  useUpdateProduct,
  useChangeSaleStatus,
  useChangeOptionCombination,
  useProductDetail,
  useProductDraft,
  useRegisterProduct,
  productImageUrl,
  type SellerProductSearchInput,
} from './products.queries'
export {
  INSPECTION_STATUS_LABEL,
  KEYWORD_MAX,
  SALE_STATUS_LABEL,
  emptyProductForm,
  productErrorMessage,
  toFormValues,
  toRegisterRequest,
  toUpdateRequest,
  type CategoryNode,
  type SellerAssignableSaleStatus,
  type SellerProductSearchParams,
  type SellerProductSort,
  type SellerProductStockFilter,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from './products.contract'
export { InventoryDrawer } from './components/InventoryDrawer'
export { ProductEditor } from './components/ProductEditor'
export { ProductMissing } from './components/ProductMissing'

// 장바구니 배럴. 라인 원본은 서버가 소유하고(cart.queries — GET/POST/PATCH/DELETE /carts*),
// 선택(체크) 상태만 클라이언트 스토어(cart-selection.store)가 든다. feature/route는 여기서 읽는다.
export { cartLineKey } from '@aechak/domain'
export {
  buildServerCartView,
  cartErrorMessage,
  sellerShippingFee,
  CART_MAX_QUANTITY,
  CART_QUERY_KEY,
  useAddCartItem,
  useCartCount,
  useCartQuery,
  useCartView,
  useDeleteCartItems,
  useUpdateCartItem,
  type CartGroup,
  type CartLine,
  type ServerCartView,
  type UpdateCartItemInput,
} from './cart.queries'
export {
  CART_SELECTION_STORAGE_KEY,
  getDeselectedCartItemIds,
  moveCartSelection,
  resetCartSelection,
  setCartItemSelected,
  setCartItemsSelected,
  useDeselectedCartItemIds,
} from './cart-selection.store'

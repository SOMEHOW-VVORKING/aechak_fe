// 구매자 주문 공용 어댑터 배럴. 주문 목록·상세는 서버(GET /order-groups, GET /orders/{orderId})가 단일
// 소스이고, 결제 성공 화면과 구매확정(POST /orders/{id}/confirm)이 ORDER_GROUPS_QUERY_KEY 접두로 캐시를
// 무효화한다. 클라이언트 목업 주문 스토어(addOrder 등)는 폐기됐다.
// 주문그룹 생성(POST /order-groups)과 시도 기록은 주문서가 쓴다.
export {
  ORDER_GROUPS_QUERY_KEY,
  confirmPurchaseErrorMessage,
  createOrderGroupErrorCode,
  createOrderGroupErrorMessage,
  createOrderGroupWithKey,
  holdsOrderItem,
  isAlreadyConfirmed,
  isOrderGroupNotFound,
  isOrderNotFound,
  orderErrorMessage,
  toBuyerOrder,
  toBuyerOrderDetail,
  toBuyerOrderGroupDetail,
  toBuyerOrderStatus,
  useConfirmPurchase,
  useCreateOrderGroup,
  useOrderDetail,
  useOrderGroup,
  useOrderGroups,
} from './order.queries'
export type { CreateOrderGroupInput, OrderSegment } from './order.queries'
// 클레임(취소·반품·교환) — 내역·요청·철회·사유 선택지. 요청·철회가 ORDER_GROUPS_QUERY_KEY 접두를
// 무효화하므로 주문 목록·상세·내역이 함께 갱신된다.
export {
  CLAIM_REASONS_QUERY_KEY,
  RETURN_WINDOW_DAYS,
  canRequestClaim,
  claimListErrorMessage,
  claimReasonsErrorMessage,
  isClaimAlreadyInProgress,
  isClaimOrderNotFound,
  isWithdrawable,
  needsReasonDetail,
  requestClaimErrorMessage,
  toBuyerClaimReasonCatalog,
  toBuyerClaimRecord,
  toKstInstant,
  useClaimReasons,
  useOrderClaims,
  useRequestClaim,
  useWithdrawClaim,
  withdrawClaimErrorMessage,
} from './claim.queries'
export type { RequestClaimInput, WithdrawClaimInput } from './claim.queries'
export {
  ORDER_ATTEMPT_STORAGE_KEY,
  buildOrderFingerprint,
  ensureOrderAttempt,
  isOrderAttemptReenterable,
  markOrderAttemptCreated,
  orderAttemptLinesInCart,
  readOrderAttempt,
  readReenterableOrderAttempt,
  resetOrderAttempt,
} from './order-attempt.store'
export type { OrderAttempt, OrderFingerprintInput, OrderSnapshot } from './order-attempt.store'

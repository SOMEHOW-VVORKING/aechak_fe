import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmPurchase,
  customInstance,
  errorResponse,
  getOrderDetail,
  getOrderGroup,
  getOrderGroups,
  type ClaimStatus,
  type ClaimType,
  type CreateOrderGroupEnvelope,
  type CreateOrderGroupRequest,
  type CreateOrderGroupResponse,
  type OrderActiveClaimResponse,
  type OrderDeliveryAddressResponse,
  type OrderDetailResponse,
  type OrderGroupDetailResponse,
  type OrderGroupItemResponse,
  type OrderGroupSellerOrderResponse,
  type OrderItemStatus,
  type OrderLineItemResponse,
  type OrderListStatusFilter,
  type OrderShipmentResponse,
  type OrderStatus,
  type RefundStatus,
  type SellerOrderItemResponse,
} from '@aechak/api'
import type {
  BuyerClaimRefundStatus,
  BuyerClaimStatus,
  BuyerClaimType,
  BuyerOrder,
  BuyerOrderClaim,
  BuyerOrderDeliveryAddress,
  BuyerOrderDetail,
  BuyerOrderGroupDetail,
  BuyerOrderItem,
  BuyerOrderItemStatus,
  BuyerOrderShipment,
  BuyerOrderStatus,
  BuyerSellerOrder,
} from '@aechak/domain'

// 주문 목록(GET /order-groups)·상세(GET /orders/{orderId})·구매확정(POST /orders/{id}/confirm) 어댑터.
// 생성 훅이 아니라 fetcher만 소비하고 서버 enum(OrderStatus/OrderItemStatus/OrderListStatusFilter/
// ClaimType/ClaimStatus/RefundStatus)은 이 파일 안에서 도메인 값으로 접는다.
// 결제 성공 화면과 구매확정이 `ORDER_GROUPS_QUERY_KEY` 접두로 목록·상세를 함께 무효화한다.

export const ORDER_GROUPS_QUERY_KEY = ['order-groups'] as const

const PAGE_SIZE = 10

// 화면 세그먼트(전체/진행중/완료/취소) — 서버 status 필터로 1:1 매핑된다.
export type OrderSegment = 'all' | 'in-progress' | 'done' | 'canceled'

const SEGMENT_STATUS: Record<OrderSegment, OrderListStatusFilter> = {
  all: 'all',
  'in-progress': 'ongoing',
  done: 'completed',
  canceled: 'cancelled',
}

// 서버 8종 → 표시 6종. 출고 대기(DISPATCH_PENDING)는 아직 운송이 시작되지 않아 준비중으로 접는다.
// 결제대기(PENDING_PAYMENT)는 목록·상세 응답에 오지 않으므로 null — 오면 건너뛴다.
const STATUS_MAP: Record<OrderStatus, BuyerOrderStatus | null> = {
  PENDING_PAYMENT: null,
  PAID: 'paid',
  PREPARING: 'preparing',
  DISPATCH_PENDING: 'preparing',
  SHIPPING: 'shipping',
  DELIVERED: 'delivered',
  PURCHASE_CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
}

const ITEM_STATUS_MAP: Record<OrderItemStatus, BuyerOrderItemStatus> = {
  ORDERED: 'ordered',
  CANCELLED: 'cancelled',
  RETURN_REQUESTED: 'return-requested',
  RETURNED: 'returned',
  EXCHANGE_REQUESTED: 'exchange-requested',
}

export function toBuyerOrderStatus(status: OrderStatus): BuyerOrderStatus | null {
  return STATUS_MAP[status] ?? null
}

// 서버 ClaimType/ClaimStatus/RefundStatus → 표시 값. Record로 전수를 받아 서버가 값을 늘리면
// 스키마 갱신 시점에 typecheck가 깨지게 둔다(상태 허용값이 문서에 없어 추측 목록을 만들면 안 된다 — SCRUM-274).
export const CLAIM_TYPE_MAP: Record<ClaimType, BuyerClaimType> = {
  CANCEL: 'cancel',
  RETURN: 'return',
  EXCHANGE: 'exchange',
}

/** 도메인 유형 → 서버 enum. 클레임 요청 본문과 사유 선택지 매칭이 쓴다. */
export const SERVER_CLAIM_TYPE: Record<BuyerClaimType, ClaimType> = {
  cancel: 'CANCEL',
  return: 'RETURN',
  exchange: 'EXCHANGE',
}

export const CLAIM_STATUS_MAP: Record<ClaimStatus, BuyerClaimStatus> = {
  CLAIM_REQUESTED: 'requested',
  COLLECTING: 'collecting',
  APPROVED: 'approved',
  ADMIN_OVERRIDDEN: 'admin-overridden',
  REFUND_FAILED: 'refund-failed',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
}

/**
 * 품목을 풀어주는 종결 상태(be ClaimStatus.RELEASED). 서버는 이 둘을 주문 상세 activeClaim으로
 * 싣지 않으므로 어댑터가 null로 접어 화면이 "진행 중"으로 오인하지 않게 한다.
 * 클레임 내역(GET .../claims)에는 그대로 실려 오고 그쪽은 접지 않는다.
 */
const RELEASED_CLAIM_STATUSES: ReadonlySet<BuyerClaimStatus> = new Set<BuyerClaimStatus>([
  'rejected',
  'withdrawn',
])

/** 이 클레임이 아직 주문품목을 붙잡고 있는지 — 붙잡고 있으면 같은 품목에 새 요청을 못 넣는다. */
export function holdsOrderItem(status: BuyerClaimStatus): boolean {
  return !RELEASED_CLAIM_STATUSES.has(status)
}

export const REFUND_STATUS_MAP: Record<RefundStatus, BuyerClaimRefundStatus> = {
  NONE: 'none',
  REQUESTED: 'requested',
  DONE: 'done',
  REFUND_FAILED: 'failed',
}

function toBuyerOrderItem(item: OrderLineItemResponse): BuyerOrderItem {
  return {
    name: item.productName,
    option: item.optionName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    itemStatus: ITEM_STATUS_MAP[item.itemStatus] ?? 'ordered',
    thumbnailUrl: item.thumbnailUrl ?? undefined,
    productId: item.productId,
    orderItemId: item.orderItemId,
  }
}

function toBuyerDeliveryAddress(
  address: OrderDeliveryAddressResponse,
): BuyerOrderDeliveryAddress {
  return {
    receiverName: address.receiverName,
    contactNumber: address.contactNumber,
    zipCode: address.zipCode,
    baseAddress: address.baseAddress,
    detailAddress: address.detailAddress ?? undefined,
    deliveryMemo: address.deliveryMemo ?? undefined,
  }
}

function toBuyerShipment(shipment: OrderShipmentResponse): BuyerOrderShipment {
  return {
    courierCode: shipment.courierCode,
    courierName: shipment.courierName,
    trackingNumber: shipment.trackingNumber,
    dispatchedAt: shipment.dispatchedAt ?? undefined,
    deliveredAt: shipment.deliveredAt ?? undefined,
    lastTrackingStatus: shipment.lastTrackingStatus ?? undefined,
  }
}

/** 진행 중으로 볼 수 없는 상태(거부·철회)면 null — 화면은 클레임이 없는 것으로 다룬다. */
function toBuyerClaim(claim: OrderActiveClaimResponse): BuyerOrderClaim | null {
  const status = CLAIM_STATUS_MAP[claim.status]
  if (status == null || !holdsOrderItem(status)) return null
  return {
    claimPublicId: claim.claimPublicId,
    claimType: CLAIM_TYPE_MAP[claim.claimType] ?? 'cancel',
    status,
    rawStatus: claim.status,
    refundStatus: claim.refundStatus ? REFUND_STATUS_MAP[claim.refundStatus] : undefined,
  }
}

function toBuyerSellerOrder(so: SellerOrderItemResponse): BuyerSellerOrder | null {
  const status = toBuyerOrderStatus(so.status)
  if (status == null) return null
  return {
    orderId: so.orderId,
    storeName: so.sellerName ?? undefined,
    status,
    rawStatus: so.status,
    itemCount: so.itemCount,
    representativeItem: so.representativeItem ? toBuyerOrderItem(so.representativeItem) : undefined,
  }
}

/** 주문그룹 응답 → 도메인. 표시할 셀러 주문이 하나도 없으면(전부 결제대기) null. */
export function toBuyerOrder(group: OrderGroupItemResponse): BuyerOrder | null {
  const sellerOrders = group.sellerOrders
    .map(toBuyerSellerOrder)
    .filter((so): so is BuyerSellerOrder => so != null)
  if (sellerOrders.length === 0) return null
  return {
    id: group.orderGroupId,
    orderedAt: group.orderedAt,
    sellerOrders,
    itemsTotal: group.totalProductAmount,
    shippingTotal: group.totalShippingFee,
    couponDiscount: group.couponDiscountAmount,
    pointsUsed: group.usedPoint,
    paidAmount: group.finalPaymentAmount,
  }
}

/** 셀러 주문 상세 응답 → 도메인. 결제대기 상태는 서버가 404로 막지만 혹시 오면 null. */
export function toBuyerOrderDetail(detail: OrderDetailResponse): BuyerOrderDetail | null {
  const status = toBuyerOrderStatus(detail.status)
  if (status == null) return null
  const activeClaim = detail.activeClaim ? toBuyerClaim(detail.activeClaim) : null
  return {
    orderId: detail.orderId,
    orderGroupId: detail.orderGroupId,
    orderedAt: detail.orderedAt,
    status,
    rawStatus: detail.status,
    storeName: detail.sellerName ?? undefined,
    items: detail.items.map(toBuyerOrderItem),
    sellerShippingFee: detail.payment.sellerShippingFee,
    groupPayment: {
      itemsTotal: detail.payment.totalProductAmount,
      shippingTotal: detail.payment.totalShippingFee,
      couponDiscount: detail.payment.couponDiscountAmount,
      pointsUsed: detail.payment.usedPoint,
      paidAmount: detail.payment.finalPaymentAmount,
    },
    // 계약상 항상 오지만 방어적으로 읽는다 — 한 필드가 비어 상세 전체가 터지면 손해가 크다.
    deliveryAddress: detail.deliveryAddress
      ? toBuyerDeliveryAddress(detail.deliveryAddress)
      : undefined,
    shipment: detail.shipment ? toBuyerShipment(detail.shipment) : undefined,
    activeClaim: activeClaim ?? undefined,
    purchaseConfirmDueAt: detail.purchaseConfirmDueAt ?? undefined,
  }
}

interface OrderGroupPage {
  groups: BuyerOrder[]
  /** 첫 페이지에만 실린다(이후 null). */
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}

async function fetchOrderGroupPage(
  status: OrderListStatusFilter,
  cursor: string | undefined,
  signal: AbortSignal | undefined,
): Promise<OrderGroupPage> {
  const res = await getOrderGroups({ status, cursor, size: PAGE_SIZE }, signal)
  const groups = res.data.orderGroups
    .map(toBuyerOrder)
    .filter((group): group is BuyerOrder => group != null)
  return {
    groups,
    totalCount: res.data.totalCount ?? null,
    nextCursor: res.data.nextCursor ?? null,
    hasNext: res.data.hasNext,
  }
}

// 모듈 레벨 안정 셀렉터 — 페이지를 평탄화하고 첫 페이지의 totalCount만 보존한다.
function selectOrderGroups(data: { pages: OrderGroupPage[] }): {
  groups: BuyerOrder[]
  totalCount: number | null
} {
  return {
    groups: data.pages.flatMap(page => page.groups),
    totalCount: data.pages[0]?.totalCount ?? null,
  }
}

/** 세그먼트별 주문그룹 목록(커서 무한쿼리). 세그먼트가 바뀌면 키가 달라져 커서를 처음부터 다시 받는다. */
export function useOrderGroups(segment: OrderSegment) {
  const status = SEGMENT_STATUS[segment]
  const query = useInfiniteQuery({
    queryKey: [...ORDER_GROUPS_QUERY_KEY, 'list', status],
    queryFn: ({ pageParam, signal }) => fetchOrderGroupPage(status, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    select: selectOrderGroups,
  })
  return {
    groups: query.data?.groups ?? [],
    totalCount: query.data?.totalCount ?? null,
    // 데이터도 에러도 없는 상태(첫 로딩·오프라인 paused)가 로딩 신호다 — isLoading(=fetching 중)으로 가르면
    // 오프라인 첫 마운트가 '주문 없음'으로 떨어진다.
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
  }
}

/** 셀러 주문 상세. 없음·남의 것·결제대기는 서버가 404(50000) 하나로 통일한다 — 재시도하지 않는다. */
export function useOrderDetail(orderId: string) {
  const query = useQuery({
    queryKey: [...ORDER_GROUPS_QUERY_KEY, 'detail', orderId],
    queryFn: ({ signal }) => getOrderDetail(orderId, signal),
    select: res => toBuyerOrderDetail(res.data),
    retry: (failureCount, error) => !isOrderNotFound(error) && failureCount < 1,
  })
  return {
    // 조회는 성공했지만 표시할 수 없는 상태(결제대기)면 null — 화면은 404와 같이 다룬다.
    order: query.data,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

// ---- 주문그룹 조회(GET /order-groups/{orderGroupId}) ---------------------------
// 주문 상세가 셀러 주문 하나만 보여 주므로 같은 결제의 형제 주문을 이 경로로 읽는다.
// 금액·배송지는 주문 상세에 같은 값이 이미 있어 담지 않는다(중복 표시 금지).

/** 주문그룹 응답의 셀러 주문 → 도메인. 대표 품목과 라인 수는 전체 품목에서 뽑는다. */
function toBuyerGroupSellerOrder(so: OrderGroupSellerOrderResponse): BuyerSellerOrder | null {
  const status = toBuyerOrderStatus(so.status)
  if (status == null) return null
  const first = so.items[0]
  return {
    orderId: so.orderId,
    storeName: so.sellerName ?? undefined,
    status,
    rawStatus: so.status,
    itemCount: so.items.length,
    representativeItem: first ? toBuyerOrderItem(first) : undefined,
  }
}

/** 주문그룹 상세 응답 → 도메인. 결제대기 주문은 표시 상태가 없어 걸러낸다. */
export function toBuyerOrderGroupDetail(
  detail: OrderGroupDetailResponse,
): BuyerOrderGroupDetail {
  return {
    orderGroupId: detail.orderGroupId,
    sellerOrders: detail.orders
      .map(toBuyerGroupSellerOrder)
      .filter((so): so is BuyerSellerOrder => so != null),
  }
}

/**
 * 주문그룹 조회. 없음·남의 것은 404 50109 하나로 통일되므로 재시도하지 않는다.
 * 호출부가 `enabled`로 끌 수 있게 열어 둔다(주문그룹 번호를 모르는 화면이 있다).
 */
export function useOrderGroup(orderGroupId: string | undefined) {
  const query = useQuery({
    queryKey: [...ORDER_GROUPS_QUERY_KEY, 'group', orderGroupId],
    queryFn: ({ signal }) => getOrderGroup(orderGroupId as string, signal),
    select: res => toBuyerOrderGroupDetail(res.data),
    enabled: orderGroupId != null && orderGroupId !== '',
    retry: (failureCount, error) => !isOrderGroupNotFound(error) && failureCount < 1,
  })
  return {
    group: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  }
}

const ORDER_GROUP_NOT_FOUND = 50109

export function isOrderGroupNotFound(error: unknown): boolean {
  const res = errorResponse(error)
  return (
    res?.status === 404 &&
    (res.data?.errorCode == null || res.data.errorCode === ORDER_GROUP_NOT_FOUND)
  )
}

// ---- 구매확정(POST /orders/{orderPublicId}/confirm) ----------------------------
// be domain/.../order/error/OrderErrorCode.kt의 값을 직접 읽어 적었다(추측 금지).
// 50007 ORDER_NOT_CONFIRMABLE(409) — 배송완료가 아니거나 진행 중 클레임이 있음
// 50008 ORDER_ALREADY_CONFIRMED(409) — 이미 확정(자동확정이 앞질렀거나 동시 요청 경합)
// 50000 ORDER_NOT_FOUND(404) — 없음·남의 주문·결제대기
const ORDER_NOT_FOUND = 50000
const ORDER_NOT_CONFIRMABLE = 50007
const ORDER_ALREADY_CONFIRMED = 50008

/**
 * 구매확정. **비가역**이라 호출부는 확인 Modal을 거친다.
 * 성공·실패 어느 쪽이든 서버 상태가 이미 움직였을 수 있어(50008은 확정이 끝난 상태다)
 * 목록·상세 캐시를 함께 무효화한다 — 화면이 낡은 '배송완료'를 그대로 들고 있지 않게 한다.
 */
export function useConfirmPurchase() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (orderId: string) => confirmPurchase(orderId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDER_GROUPS_QUERY_KEY }),
  })
  return {
    isPending: mutation.isPending,
    confirm: (orderId: string, handlers: { onSuccess: () => void; onError: (e: unknown) => void }) =>
      mutation.mutate(orderId, handlers),
  }
}

/** 이미 확정된 건은 거절이지만 결과는 사용자가 원한 그것이다 — 화면이 성공처럼 다루게 구분해 준다. */
export function isAlreadyConfirmed(error: unknown): boolean {
  return errorResponse(error)?.data?.errorCode === ORDER_ALREADY_CONFIRMED
}

export function confirmPurchaseErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case ORDER_ALREADY_CONFIRMED:
      return '이미 구매확정된 주문이에요'
    // 배송완료가 아니거나 진행 중 클레임이 생긴 것 — 화면이 버튼을 띄운 뒤 상태가 바뀐 경우다.
    // 토스트는 한 줄로 그려지므로(AppToast) 사유를 길게 늘어놓지 않고, 갱신된 상세가 이유를 보여준다.
    case ORDER_NOT_CONFIRMABLE:
      return '구매확정할 수 없는 상태로 바뀌었어요'
    case ORDER_NOT_FOUND:
      return '주문을 찾을 수 없어요'
    default:
      break
  }
  switch (res?.status) {
    case 403:
      return '구매확정할 권한이 없어요'
    case 404:
      return '주문을 찾을 수 없어요'
    default:
      return '구매확정하지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

export function isOrderNotFound(error: unknown): boolean {
  const res = errorResponse(error)
  return (
    res?.status === 404 && (res.data?.errorCode == null || res.data.errorCode === ORDER_NOT_FOUND)
  )
}

// 에러 문구는 HTTP status로 고르고 같은 status에 여러 사유가 있으면 errorCode까지 본다.
// 401은 인터셉터의 refresh + 전역 리다이렉트가 처리하므로 여기 오지 않는다.
export function orderErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.status) {
    case 400:
      return res.data?.errorCode === 90002
        ? '목록 위치가 바뀌었어요. 다시 불러와 주세요'
        : '요청이 올바르지 않아요. 다시 시도해 주세요'
    case 403:
      return '주문을 볼 권한이 없어요'
    case 404:
      return '주문을 찾을 수 없어요'
    default:
      return '주문 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

// ---- 주문그룹 생성(POST /order-groups) -----------------------------------------
// orval이 header 파라미터를 생성하지 않아 Idempotency-Key는 customInstance로 직접 붙인다.
export interface CreateOrderGroupInput {
  idempotencyKey: string
  body: CreateOrderGroupRequest
}

export function createOrderGroupWithKey(
  input: CreateOrderGroupInput,
  signal?: AbortSignal,
): Promise<CreateOrderGroupEnvelope> {
  return customInstance<CreateOrderGroupEnvelope>({
    url: '/order-groups',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
    data: input.body,
    signal,
  })
}

/** 주문그룹 생성 mutation. 같은 키 재전송은 서버가 최초 결과를 재반환하므로 재시도는 호출부(attempt)가 키를 고정한다. */
export function useCreateOrderGroup() {
  const mutation = useMutation({
    mutationFn: (input: CreateOrderGroupInput) => createOrderGroupWithKey(input),
  })
  return {
    isPending: mutation.isPending,
    mutateAsync: (input: CreateOrderGroupInput): Promise<CreateOrderGroupResponse> =>
      mutation.mutateAsync(input).then(res => res.data),
  }
}

export function createOrderGroupErrorCode(error: unknown): number | undefined {
  return errorResponse(error)?.data?.errorCode
}

// BE OrderErrorCode(501xx)·CartErrorCode(502xx)·포인트(30101)·배송지(305xx)·멱등키(90004) 문구.
export function createOrderGroupErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case 50106:
      return '주문 금액이 바뀌어 다시 계산했어요. 금액을 확인하고 다시 결제해 주세요'
    case 50104:
      return '주문할 수 없는 상품이 있어요. 장바구니를 확인해 주세요'
    case 50105:
      return '상품 정보가 바뀌었어요. 장바구니를 다시 확인해 주세요'
    case 50107:
      return '재고가 부족한 상품이 있어요. 장바구니를 확인해 주세요'
    case 50205:
      return '장바구니에 없는 상품이 있어요. 장바구니를 다시 확인해 주세요'
    case 50207:
      return '판매하지 않는 상품이 있어요. 장바구니를 다시 확인해 주세요'
    case 50101:
      return '주문 정보가 올바르지 않아요. 장바구니에서 다시 주문해 주세요'
    case 50103:
      return '적립금은 1,000원부터 사용할 수 있어요'
    case 50102:
      return '적립금은 결제 금액을 넘겨 쓸 수 없어요'
    case 50108:
      return '결제 금액은 100원 이상이어야 해요'
    case 30101:
      return '적립금 잔액이 부족해요'
    case 30501:
      return '배송지를 찾을 수 없어요. 배송지를 다시 선택해 주세요'
    case 30502:
      return '본인 배송지만 사용할 수 있어요'
    case 90004:
    case 90005:
      return '주문 요청이 올바르지 않아요. 다시 시도해 주세요'
    default:
      break
  }
  switch (res?.status) {
    case 400:
      return '주문 정보가 올바르지 않아요. 다시 시도해 주세요'
    case 403:
      return '주문할 권한이 없어요'
    default:
      return '주문을 만들지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

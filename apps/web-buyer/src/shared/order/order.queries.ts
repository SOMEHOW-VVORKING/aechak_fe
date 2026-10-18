import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import {
  customInstance,
  errorResponse,
  getOrderDetail,
  getOrderGroups,
  type CreateOrderGroupEnvelope,
  type CreateOrderGroupRequest,
  type CreateOrderGroupResponse,
  type OrderDetailResponse,
  type OrderGroupItemResponse,
  type OrderItemStatus,
  type OrderLineItemResponse,
  type OrderListStatusFilter,
  type OrderStatus,
  type SellerOrderItemResponse,
} from '@aechak/api'
import type {
  BuyerOrder,
  BuyerOrderDetail,
  BuyerOrderItem,
  BuyerOrderItemStatus,
  BuyerOrderStatus,
  BuyerSellerOrder,
} from '@aechak/domain'

// 주문 목록(GET /order-groups)·상세(GET /orders/{orderId}) 어댑터. 생성 훅이 아니라 fetcher만 소비하고
// 서버 enum(OrderStatus/OrderItemStatus/OrderListStatusFilter)은 이 파일 안에서 도메인 값으로 접는다.
// 결제 성공 화면이 `ORDER_GROUPS_QUERY_KEY` 접두로 목록·상세를 함께 무효화한다.

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

function toBuyerOrderItem(item: OrderLineItemResponse): BuyerOrderItem {
  return {
    name: item.productName,
    option: item.optionName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    itemStatus: ITEM_STATUS_MAP[item.itemStatus] ?? 'ordered',
    thumbnailUrl: item.thumbnailUrl ?? undefined,
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

const ORDER_NOT_FOUND = 50000

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

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addCartItem,
  deleteCartItems,
  errorResponse,
  getAccessToken,
  getCart,
  updateCartItem,
  type AddCartItemResponse,
  type CartEnvelope,
  type CartItemResponse,
  type CartItemStatus,
  type CartResponse,
  type CartSellerGroupResponse,
  type DeleteCartItemsResponse,
  type UpdateCartItemResponse,
} from '@aechak/api'
import {
  moveCartSelection,
  setCartItemSelected,
  useDeselectedCartItemIds,
} from './cart-selection.store'
import { createQuantityQueue } from './cart-quantity-queue'

// 서버 장바구니 어댑터. 담기(상품 상세)·조회/수정/삭제(장바구니)·배지(홈/마켓)가 같이 쓰므로 shared에
// 둔다. 라인 원본은 서버가 소유(mutation 성공 시 invalidate), 선택 상태만 cart-selection.store가 든다.
// 생성 react-query 훅 대신 fetcher만 소비하고 여기서 자체 useQuery/useMutation으로 감싼다.

export const CART_QUERY_KEY = ['cart'] as const

/** 서버 계약(BE Cart.MAX_QUANTITY)과 동일한 라인당 수량 상한. */
export const CART_MAX_QUANTITY = 99

// 주문 불가 상태 → 라인 라벨. ACTIVE만 주문 가능(isOrderable)이라 여기 없다.
const UNAVAILABLE_LABEL: Record<Exclude<CartItemStatus, 'ACTIVE'>, string> = {
  OUT_OF_STOCK: '품절',
  SALE_ENDED: '판매종료',
  SALE_SUSPENDED: '판매중지',
  SELLER_UNAVAILABLE: '판매중지',
  OPTION_UNAVAILABLE: '옵션 판매중지',
}

export interface CartLine {
  cartItemId: number
  productId: string
  optionCombinationId: number
  /** 선택한 옵션 조합 라벨(서버 selectedOptions). */
  option: string
  quantity: number
  /** 잔여 재고 — 수량 스테퍼 상한에 쓴다. */
  remainingStock: number
  /** 사용자가 체크한 값. 주문 불가 라인도 체크할 수 있다(전체 선택/선택 삭제 대상). */
  selected: boolean
  /** 주문 대상 여부(서버 isOrderable). 주문 합계·주문 가능 판정은 selected && orderable만 센다. */
  orderable: boolean
  /** 주문 불가 사유 라벨. 주문 가능하면 null. */
  unavailableLabel: string | null
  /** 담긴 수량이 잔여 재고를 초과(재고>0인데 부족). 서버는 재고 0일 때만 OUT_OF_STOCK을 준다. */
  exceedsStock: boolean
  /** 단가(판매가+옵션 추가금, 서버 합산) * 수량. */
  lineTotal: number
  /** price는 옵션 추가금이 합산된 단가, originalPrice는 할인 전 단가(취소선 표시 전용). */
  product: { name: string; price: number; originalPrice: number; thumbnailUrl?: string }
}

export interface CartGroup {
  sellerId: number
  storeName: string
  baseShippingFee: number
  freeShippingThreshold: number | null
  lines: CartLine[]
  /** 이 셀러에서 선택된 주문 대상 상품 합계. */
  selectedSubtotal: number
  /** 주문 대상 선택 항목이 있고 무료배송 임계 미만이면 부과, 아니면 0. */
  shippingFee: number
  freeShipping: boolean
}

// shared/catalog의 목업 CartView(buildCartView)와 필드가 겹쳐 이름을 ServerCartView로 구분한다.
export interface ServerCartView {
  groups: CartGroup[]
  /** 체크 가능한 라인 id 전체(주문 불가 포함). 전체 선택 토글·선택 삭제의 대상. */
  selectableIds: number[]
  allSelected: boolean
  /** 체크된 라인 수(주문 불가 포함). */
  selectedLineCount: number
  /** 체크된 라인 중 주문 대상 라인 수. 주문하기 버튼 라벨·활성 판정용. */
  orderableLineCount: number
  /** 체크된 라인에 주문 불가(품절 등)가 하나라도 있으면 true. */
  hasSelectedUnavailable: boolean
  /** 체크된 라인에 재고 초과(quantity > remainingStock)가 있으면 true. */
  hasSelectedExceedsStock: boolean
  /** 주문 대상(선택 + 주문 가능) 라인 수량 합계. */
  selectedQuantity: number
  itemsTotal: number
  shippingTotal: number
  grandTotal: number
  isEmpty: boolean
}

function toLine(item: CartItemResponse, deselected: ReadonlySet<number>): CartLine {
  return {
    cartItemId: item.cartItemId,
    productId: item.productId,
    optionCombinationId: item.optionCombinationId,
    option: item.selectedOptions,
    quantity: item.quantity,
    remainingStock: item.remainingStock,
    selected: !deselected.has(item.cartItemId),
    orderable: item.isOrderable,
    // BE가 FE 스키마보다 먼저 새 상태를 내려보내면 조회가 undefined다 — 빈 pill 방지 폴백.
    unavailableLabel: item.isOrderable
      ? null
      : (UNAVAILABLE_LABEL[item.itemStatus as Exclude<CartItemStatus, 'ACTIVE'>] ?? '구매 불가'),
    exceedsStock: item.isOrderable && item.quantity > item.remainingStock,
    lineTotal: item.price * item.quantity,
    product: {
      name: item.productName,
      price: item.price,
      originalPrice: item.originalPrice,
      thumbnailUrl: item.thumbnail ?? undefined,
    },
  }
}

/** 셀러 배송비 — 선택되고 주문 가능한 라인 합이 임계 이상이면 0, 임계 null이면 항상 base(서버 OrderService와 동일). */
export function sellerShippingFee(
  group: { baseShippingFee: number; freeShippingThreshold: number | null },
  selectedSubtotal: number,
  hasSelected: boolean,
): { shippingFee: number; freeShipping: boolean } {
  const freeShipping =
    hasSelected &&
    group.freeShippingThreshold != null &&
    selectedSubtotal >= group.freeShippingThreshold
  return { shippingFee: hasSelected && !freeShipping ? group.baseShippingFee : 0, freeShipping }
}

function toGroup(group: CartSellerGroupResponse, deselected: ReadonlySet<number>): CartGroup {
  const lines = group.items.map(item => toLine(item, deselected))
  const orderableSelected = lines.filter(l => l.selected && l.orderable)
  const selectedSubtotal = orderableSelected.reduce((sum, l) => sum + l.lineTotal, 0)
  const freeShippingThreshold = group.freeShippingThreshold ?? null
  const { shippingFee, freeShipping } = sellerShippingFee(
    { baseShippingFee: group.baseShippingFee, freeShippingThreshold },
    selectedSubtotal,
    orderableSelected.length > 0,
  )
  return {
    sellerId: group.sellerId,
    storeName: group.storeName,
    baseShippingFee: group.baseShippingFee,
    freeShippingThreshold,
    lines,
    selectedSubtotal,
    shippingFee,
    freeShipping,
  }
}

/** 서버 장바구니 응답 + 클라이언트 해제 집합 → 화면 뷰. 순수 함수. */
export function buildServerCartView(
  res: CartResponse,
  deselected: ReadonlySet<number>,
): ServerCartView {
  const groups = res.sellerGroups.map(g => toGroup(g, deselected))
  const lines = groups.flatMap(g => g.lines)
  const selectedLines = lines.filter(l => l.selected)
  const orderableSelectedLines = selectedLines.filter(l => l.orderable)
  const itemsTotal = groups.reduce((sum, g) => sum + g.selectedSubtotal, 0)
  const shippingTotal = groups.reduce((sum, g) => sum + g.shippingFee, 0)
  return {
    groups,
    selectableIds: lines.map(l => l.cartItemId),
    allSelected: lines.length > 0 && selectedLines.length === lines.length,
    selectedLineCount: selectedLines.length,
    orderableLineCount: orderableSelectedLines.length,
    hasSelectedUnavailable: selectedLines.some(l => !l.orderable),
    hasSelectedExceedsStock: selectedLines.some(l => l.exceedsStock),
    selectedQuantity: orderableSelectedLines.reduce((sum, l) => sum + l.quantity, 0),
    itemsTotal,
    shippingTotal,
    grandTotal: itemsTotal + shippingTotal,
    isEmpty: lines.length === 0,
  }
}

/** 서버 장바구니 원본 쿼리. 화면 뷰는 useCartView, 배지는 useCartCount를 쓸 것. */
export function useCartQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: ({ signal }) => getCart(signal),
    enabled: options?.enabled ?? true,
  })
}

export function useCartView(options?: { enabled?: boolean }): {
  view: ServerCartView | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const query = useCartQuery(options)
  const deselected = useDeselectedCartItemIds()
  const data = query.data?.data
  const view = useMemo(
    () => (data ? buildServerCartView(data, deselected) : null),
    [data, deselected],
  )
  return {
    view,
    isLoading: query.isLoading,
    // 캐시가 남아 있으면 배경 refetch 실패로 화면을 에러로 갈아끼우지 않는다.
    isError: query.isError && data == null,
    refetch: () => void query.refetch(),
  }
}

const countLines = (res: CartEnvelope) =>
  res.data.sellerGroups.reduce((sum, g) => sum + g.items.length, 0)

/**
 * 앱바 배지 — GET /carts 캐시에서 "표시 라인 수"를 파생한다(수량 합계가 아니라 품목 종류 수).
 * access token이 없으면 조회하지 않는다(0) — 비로그인 진입이 가능한 홈/마켓에서 401 → 전역 로그인
 * 이동으로 튕기지 않게.
 */
export function useCartCount(): number {
  const query = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: ({ signal }) => getCart(signal),
    enabled: getAccessToken() != null,
    select: countLines,
  })
  return query.data ?? 0
}

function useInvalidateCart() {
  const queryClient = useQueryClient()
  // 반환해서 react-query가 refetch까지 기다리게 한다 — isPending이 갱신 전 구간을 덮는다.
  return () => queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
}

interface MutateOptions<TData> {
  onSuccess?: (data: TData) => void
  onError?: (error: unknown) => void
}

export function useAddCartItem() {
  const invalidate = useInvalidateCart()
  const mutation = useMutation({
    mutationFn: (input: { optionCombinationId: number; quantity: number }) => addCartItem(input),
    onSuccess: res => {
      // 같은 옵션 재담기는 기존 라인에 누적된다(같은 cartItemId). 그 id가 해제돼 있었어도 방금 담은
      // 라인은 선택 상태여야 한다.
      setCartItemSelected(res.data.cartItemId, true)
      return invalidate()
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (
      input: { optionCombinationId: number; quantity: number },
      opts?: MutateOptions<AddCartItemResponse>,
    ) =>
      mutation.mutate(input, {
        onSuccess: res => opts?.onSuccess?.(res.data),
        onError: opts?.onError,
      }),
  }
}

// 수량 PATCH는 라인별 직렬화 큐를 탄다(모듈 전역 — 화면 리마운트와 무관하게 한 라인에 요청 하나).
const quantityQueue = createQuantityQueue((cartItemId: number, quantity: number) =>
  updateCartItem(cartItemId, { quantity }),
)

export interface UpdateCartItemInput {
  cartItemId: number
  /** 대입 의미(절대값). */
  quantity?: number
  optionCombinationId?: number
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCart()
  const mutation = useMutation({
    mutationFn: ({ cartItemId, quantity, optionCombinationId }: UpdateCartItemInput) => {
      if (optionCombinationId == null && quantity != null) {
        return quantityQueue.enqueue(cartItemId, quantity)
      }
      return updateCartItem(cartItemId, {
        ...(quantity != null ? { quantity } : {}),
        ...(optionCombinationId != null ? { optionCombinationId } : {}),
      })
    },
    // 낙관적 갱신은 해당 라인 수량만 — 다른 라인의 진행 중 변경을 덮지 않는다.
    onMutate: async ({ cartItemId, quantity }) => {
      if (quantity == null) return
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY })
      queryClient.setQueryData<CartEnvelope>(CART_QUERY_KEY, previous =>
        previous
          ? {
              ...previous,
              data: {
                ...previous.data,
                sellerGroups: previous.data.sellerGroups.map(group => ({
                  ...group,
                  items: group.items.map(item =>
                    item.cartItemId === cartItemId ? { ...item, quantity } : item,
                  ),
                })),
              },
            }
          : previous,
      )
    },
    // 실패하면 스냅샷 복원 대신 서버를 다시 읽는다(다른 라인의 성공분을 되돌리지 않게).
    onError: () => invalidate(),
    onSuccess: (res, { cartItemId }) => {
      if (res.data.merged) moveCartSelection(cartItemId, res.data.cartItemId)
      return invalidate()
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: UpdateCartItemInput, opts?: MutateOptions<UpdateCartItemResponse>) =>
      mutation.mutate(input, {
        onSuccess: res => opts?.onSuccess?.(res.data),
        onError: opts?.onError,
      }),
  }
}

export function useDeleteCartItems() {
  const invalidate = useInvalidateCart()
  const mutation = useMutation({
    mutationFn: (cartItemIds: number[]) => deleteCartItems({ cartItemIds }),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (cartItemIds: number[], opts?: MutateOptions<DeleteCartItemsResponse>) =>
      mutation.mutate(cartItemIds, {
        onSuccess: res => opts?.onSuccess?.(res.data),
        onError: opts?.onError,
      }),
  }
}

// 에러 문구는 서버 errorCode로 고른다(HTTP status는 코드가 겹쳐 구분이 안 됨 — 404가 50205/50207 둘 다).
export function cartErrorMessage(error: unknown): string {
  const data = errorResponse(error)?.data
  switch (data?.errorCode) {
    case 90001:
      return `수량은 1개 이상 ${CART_MAX_QUANTITY}개 이하로 담을 수 있어요`
    case 50201:
      return '재고가 부족해요'
    case 50202:
      return '상품 상태가 바뀌어 담을 수 없어요'
    case 50203:
      return '장바구니에 담을 수 있는 품목 수를 초과했어요'
    case 50205:
      return '장바구니 항목을 찾을 수 없어요'
    case 50206:
      return '본인 장바구니 항목만 변경할 수 있어요'
    case 50207:
      return '상품을 찾을 수 없어요'
    default:
      return data?.message ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}

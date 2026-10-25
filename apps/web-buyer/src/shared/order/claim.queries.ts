import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  errorResponse,
  getClaimReasons,
  getOrderClaims,
  requestClaim,
  withdrawClaim,
  type ClaimItemResponse,
  type ClaimReasonCatalogResponse,
  type ReturnCostBearer,
  type SellerApprovalStatus,
} from '@aechak/api'
import type {
  BuyerClaimCostBearer,
  BuyerClaimReasonCatalog,
  BuyerClaimReasonOption,
  BuyerClaimRequest,
  BuyerClaimSellerApproval,
  BuyerClaimType,
  BuyerOrderClaim,
  BuyerOrderDetail,
} from '@aechak/domain'
import {
  CLAIM_STATUS_MAP,
  CLAIM_TYPE_MAP,
  ORDER_GROUPS_QUERY_KEY,
  REFUND_STATUS_MAP,
  SERVER_CLAIM_TYPE,
} from './order.queries'

// 클레임(취소·반품·교환) 어댑터 — 내역(GET /orders/{id}/claims), 요청(POST 같은 경로),
// 철회(DELETE .../claims/{claimPublicId}), 사유 선택지(GET /claims/reasons).
// 내역 쿼리 키를 ORDER_GROUPS_QUERY_KEY 접두 아래 둬서 요청·철회·구매확정이 한 번의
// invalidate로 목록·상세·내역을 함께 갱신한다(클레임이 주문 상태와 구매확정 가능 여부를 바꾼다).

export const CLAIM_REASONS_QUERY_KEY = ['claim-reasons'] as const

const orderClaimsQueryKey = (orderId: string) =>
  [...ORDER_GROUPS_QUERY_KEY, 'claims', orderId] as const

// ---- 시각 정규화 -----------------------------------------------------------------
// 클레임 응답의 시각은 오프셋 없는 KST LocalDateTime이다(주문 상세의 orderedAt·dispatchedAt은
// OffsetDateTime이라 오프셋이 붙는다 — 같은 주문 도메인인데 직렬화가 갈려 있다).
// 오프셋 없는 문자열을 `new Date()`에 그대로 넣으면 **브라우저 로컬 시간**으로 읽혀 UTC 머신(CI)에서
// 9시간 어긋난다. 그래서 어댑터가 오프셋을 붙여 넘기고 표시 계층은 늘 절대 시각만 받는다.
const KST_OFFSET = '+09:00'
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/

export function toKstInstant(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return HAS_OFFSET.test(value) ? value : `${value}${KST_OFFSET}`
}

// 두 맵은 Record로 전수를 받는다 — 서버가 값을 늘리면 스키마 갱신 시점에 typecheck가 깨져야 한다
// (Record<string, …>로 두면 모르는 값이 조용히 undefined가 되어 배포에서만 드러난다).
const SELLER_APPROVAL_MAP: Record<SellerApprovalStatus, BuyerClaimSellerApproval> = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

const COST_BEARER_MAP: Record<ReturnCostBearer, BuyerClaimCostBearer> = {
  BUYER: 'buyer',
  SELLER: 'seller',
}

/** 클레임 내역 한 줄 → 도메인. 거부·철회된 과거 건도 그대로 넘긴다(내역은 접지 않는다). */
export function toBuyerClaimRecord(item: ClaimItemResponse): BuyerOrderClaim {
  return {
    claimPublicId: item.claimPublicId,
    claimType: CLAIM_TYPE_MAP[item.claimType] ?? 'cancel',
    status: CLAIM_STATUS_MAP[item.status] ?? 'requested',
    rawStatus: item.status,
    refundStatus: item.refundStatus ? REFUND_STATUS_MAP[item.refundStatus] : undefined,
    sellerApproval: item.sellerApprovalStatus
      ? SELLER_APPROVAL_MAP[item.sellerApprovalStatus]
      : undefined,
    returnCostBearer: item.returnCostBearer
      ? COST_BEARER_MAP[item.returnCostBearer]
      : undefined,
    refundAmount: item.refundAmount,
    rejectionReason: item.rejectionReason ?? undefined,
    requestedAt: toKstInstant(item.requestedAt),
    approvedAt: toKstInstant(item.approvedAt),
    resolvedAt: toKstInstant(item.resolvedAt),
    items: item.items.map(line => ({
      orderItemId: line.orderItemId,
      // 서버가 상품명 조회에 실패하면 빈 문자열을 준다 — 화면이 주문 품목에서 메우도록 비워 넘긴다.
      productName: line.productName === '' ? undefined : line.productName,
      quantity: line.quantity,
      refundAmount: line.refundAmount,
    })),
  }
}

/**
 * 주문의 클레임 내역. 상세 화면이 요청·철회 뒤 같은 접두로 무효화되면 이 쿼리도 다시 돈다.
 * 클레임이 한 건도 없는 것이 정상이라 빈 배열은 오류가 아니다.
 */
export function useOrderClaims(orderId: string) {
  const query = useQuery({
    queryKey: orderClaimsQueryKey(orderId),
    queryFn: ({ signal }) => getOrderClaims(orderId, signal),
    select: res => res.data.items.map(toBuyerClaimRecord),
    retry: (failureCount, error) => !isClaimOrderNotFound(error) && failureCount < 1,
  })
  return {
    claims: query.data ?? [],
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

// ---- 사유 선택지(GET /claims/reasons) -------------------------------------------

const EMPTY_CATALOG: BuyerClaimReasonCatalog = { cancel: [], return: [], exchange: [] }

/** 유형별 선택지 응답 → 도메인. 서버가 주지 않은 유형은 빈 배열로 남겨 화면이 "선택지 없음"을 안다. */
export function toBuyerClaimReasonCatalog(
  response: ClaimReasonCatalogResponse,
): BuyerClaimReasonCatalog {
  const catalog: BuyerClaimReasonCatalog = { cancel: [], return: [], exchange: [] }
  for (const entry of response.claimTypes) {
    const type = CLAIM_TYPE_MAP[entry.claimType]
    if (type == null) continue
    catalog[type] = entry.reasons.map(reason => ({
      code: reason.code,
      label: reason.label,
      detailRequired: reason.detailRequired,
    }))
  }
  return catalog
}

/**
 * 클레임 사유 선택지. **SCRUM-273(BE #150) 머지 전까지 dev에 이 경로가 없어 404가 온다** —
 * 그래서 재시도하지 않고(`retry: false`) 실패를 그대로 호출부에 넘긴다. 화면은 선택지를 하드코딩해
 * 되살리지 않고 "사유를 불러오지 못했어요 + 다시 시도"로 떨어진다(없는 어휘로 요청을 보내면
 * 머지 뒤에 400 50412로 거절되므로 가짜 선택지가 실패를 뒤로 미루기만 한다).
 * 어휘는 배포 주기보다 훨씬 느리게 바뀌어 한 세션 동안 다시 묻지 않는다.
 */
export function useClaimReasons() {
  const query = useQuery({
    queryKey: CLAIM_REASONS_QUERY_KEY,
    queryFn: ({ signal }) => getClaimReasons(signal),
    select: res => toBuyerClaimReasonCatalog(res.data),
    retry: false,
    staleTime: Infinity,
  })
  return {
    catalog: query.data ?? EMPTY_CATALOG,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

// ---- 요청(POST /orders/{orderPublicId}/claims) ----------------------------------

export interface RequestClaimInput {
  orderId: string
  request: BuyerClaimRequest
}

/**
 * 클레임 요청. 성공하면 서버가 확정한 환불액을 돌려주므로 호출부가 그 값을 보여 준다
 * (화면이 환불액을 미리 계산하지 않는다 — 적립금 안분과 배송비 환불 규칙이 서버에만 있다).
 * 성공·실패 어느 쪽이든 주문 상태와 구매확정 가능 여부가 움직였을 수 있어 접두를 통째로 무효화한다.
 */
export function useRequestClaim() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: RequestClaimInput) =>
      requestClaim(input.orderId, {
        claimType: SERVER_CLAIM_TYPE[input.request.claimType],
        reasonCode: input.request.reasonCode,
        ...(input.request.reasonDetail ? { reasonDetail: input.request.reasonDetail } : {}),
        ...(input.request.items && input.request.items.length > 0
          ? { items: input.request.items }
          : {}),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDER_GROUPS_QUERY_KEY }),
  })
  return {
    isPending: mutation.isPending,
    request: (
      input: RequestClaimInput,
      handlers: { onSuccess: (refundAmount: number) => void; onError: (e: unknown) => void },
    ) =>
      mutation.mutate(input, {
        onSuccess: res => handlers.onSuccess(res.data.refundAmount),
        onError: handlers.onError,
      }),
  }
}

// ---- 철회(DELETE /orders/{orderPublicId}/claims/{claimPublicId}) -----------------

export interface WithdrawClaimInput {
  orderId: string
  claimPublicId: string
}

/** 클레임 철회. 셀러가 판단하기 전에만 통하고, 철회하면 잡혀 있던 품목이 풀린다. */
export function useWithdrawClaim() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: WithdrawClaimInput) =>
      withdrawClaim(input.orderId, input.claimPublicId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDER_GROUPS_QUERY_KEY }),
  })
  return {
    isPending: mutation.isPending,
    withdraw: (
      input: WithdrawClaimInput,
      handlers: { onSuccess: () => void; onError: (e: unknown) => void },
    ) => mutation.mutate(input, handlers),
  }
}

// ---- 오류 문구 -------------------------------------------------------------------
// be OrderErrorCode의 클레임 구간(504xx)을 직접 읽어 적었다(추측 금지).
// 50400 CLAIM_NOT_FOUND(404) / 50401 CLAIM_NOT_REQUESTABLE(409) /
// 50402 INVALID_CLAIM_STATUS_TRANSITION(409) / 50403 CLAIM_ALREADY_IN_PROGRESS(409) /
// 50406 CLAIM_QUANTITY_EXCEEDS_ORDERED(422) / 50410 CLAIM_PARTIAL_QUANTITY_NOT_SUPPORTED(422) /
// 50412 CLAIM_REASON_NOT_SELECTABLE(400) · 50413 CLAIM_REASON_DETAIL_REQUIRED(400)은
// SCRUM-273 머지 뒤에 생긴다(그 전에는 사유가 자유 문자열이라 나오지 않는다).
const CLAIM_NOT_FOUND = 50400
const CLAIM_NOT_REQUESTABLE = 50401
const INVALID_CLAIM_STATUS_TRANSITION = 50402
const CLAIM_ALREADY_IN_PROGRESS = 50403
const CLAIM_QUANTITY_EXCEEDS_ORDERED = 50406
const CLAIM_PARTIAL_QUANTITY_NOT_SUPPORTED = 50410
const CLAIM_REASON_NOT_SELECTABLE = 50412
const CLAIM_REASON_DETAIL_REQUIRED = 50413
const ORDER_NOT_FOUND = 50000

/** 주문 쪽 404(없음·남의 주문) — 내역 조회가 이 경우에만 재시도를 포기한다. */
export function isClaimOrderNotFound(error: unknown): boolean {
  const res = errorResponse(error)
  return (
    res?.status === 404 &&
    (res.data?.errorCode == null || res.data.errorCode === ORDER_NOT_FOUND)
  )
}

/** 이미 진행 중 클레임이 있어 거절된 경우 — 화면이 안내를 바꿀 수 있게 구분해 준다. */
export function isClaimAlreadyInProgress(error: unknown): boolean {
  return errorResponse(error)?.data?.errorCode === CLAIM_ALREADY_IN_PROGRESS
}

export function requestClaimErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case CLAIM_NOT_REQUESTABLE:
      // 상태가 바뀌었거나 반품 기한(배송완료 +7일)이 지난 것 — 갱신된 상세가 이유를 보여 준다.
      return '지금은 요청할 수 없는 상태로 바뀌었어요'
    case CLAIM_ALREADY_IN_PROGRESS:
      return '이미 진행 중인 요청이 있어요'
    case CLAIM_QUANTITY_EXCEEDS_ORDERED:
    case CLAIM_PARTIAL_QUANTITY_NOT_SUPPORTED:
      return '주문한 수량 전부만 요청할 수 있어요'
    case CLAIM_REASON_NOT_SELECTABLE:
      return '선택할 수 없는 사유예요. 사유를 다시 골라 주세요'
    case CLAIM_REASON_DETAIL_REQUIRED:
      return '상세 사유를 입력해 주세요'
    case ORDER_NOT_FOUND:
      return '주문을 찾을 수 없어요'
    default:
      break
  }
  switch (res?.status) {
    case 400:
      return '요청 정보가 올바르지 않아요. 다시 시도해 주세요'
    case 403:
      return '요청할 권한이 없어요'
    case 404:
      return '주문을 찾을 수 없어요'
    default:
      return '요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

export function withdrawClaimErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case INVALID_CLAIM_STATUS_TRANSITION:
      // 셀러가 판단하거나 회수가 시작된 뒤에는 거둘 수 없다.
      return '판매자가 이미 확인해서 철회할 수 없어요'
    case CLAIM_NOT_FOUND:
      return '요청 내역을 찾을 수 없어요'
    case ORDER_NOT_FOUND:
      return '주문을 찾을 수 없어요'
    default:
      break
  }
  switch (res?.status) {
    case 403:
      return '철회할 권한이 없어요'
    case 404:
      return '요청 내역을 찾을 수 없어요'
    default:
      return '철회하지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

/** 내역 조회 실패 문구. 상세 전체를 죽이지 않고 카드 안에만 쓴다. */
export function claimListErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.status) {
    case 403:
      return '요청 내역을 볼 권한이 없어요'
    case 404:
      return '주문을 찾을 수 없어요'
    default:
      return '요청 내역을 불러오지 못했어요'
  }
}

/**
 * 사유 선택지 조회 실패 문구. **404는 "경로가 아직 없다"**는 뜻이고(SCRUM-273 미머지)
 * 사용자에게는 어느 쪽이든 "지금은 접수할 수 없다"가 정확한 설명이다.
 */
export function claimReasonsErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  if (res?.status === 404) return '아직 요청 사유를 받을 준비가 안 됐어요'
  return '요청 사유를 불러오지 못했어요'
}

// ---- 요청 가능 판정 ---------------------------------------------------------------

/** 반품·교환을 받는 기간(be `order.claim.return-window-days` 기본값 7일). */
export const RETURN_WINDOW_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 이 주문에서 그 유형을 요청할 수 있는지 — be `ClaimType.requestableFrom`과 같은 판정이다.
 * 취소는 발송 전(FE 표시 상태 paid·preparing = 서버 PAID·PREPARING·DISPATCH_PENDING),
 * 반품·교환은 배송완료만. 진행 중 클레임이 있으면 어느 유형도 받지 않는다(서버 409 50403).
 *
 * 반품 기한은 **서버가 주문 상태 이력의 DELIVERED 전이 시각**으로 재므로 화면이 가진
 * `shipment.deliveredAt`과 출처가 다르다(같은 트랜잭션에서 쌓여 사실상 같은 순간이지만 같다고
 * 보장되지 않는다). 그래서 이 함수는 **확실히 지난 경우만 닫고** 경계는 서버에 맡긴다 —
 * 배송완료 시각을 모르면(송장 없음) 열어 두고 서버 판정을 받는다.
 */
export function canRequestClaim(
  order: BuyerOrderDetail,
  claimType: BuyerClaimType,
  now: number = Date.now(),
): boolean {
  if (order.activeClaim != null) return false
  if (claimType === 'cancel') return order.status === 'paid' || order.status === 'preparing'
  if (order.status !== 'delivered') return false
  const deliveredAt = order.shipment?.deliveredAt
  if (deliveredAt == null) return true
  const delivered = new Date(deliveredAt).getTime()
  if (Number.isNaN(delivered)) return true
  return now <= delivered + RETURN_WINDOW_DAYS * DAY_MS
}

/** 구매자가 거둘 수 있는 클레임인지 — 셀러 판단 전(CLAIM_REQUESTED)만. */
export function isWithdrawable(claim: BuyerOrderClaim): boolean {
  return claim.status === 'requested'
}

/** 고른 사유가 상세 입력을 요구하는지. 선택지를 못 찾으면 요구하지 않는 것으로 본다. */
export function needsReasonDetail(
  options: BuyerClaimReasonOption[],
  code: string,
): boolean {
  return options.find(option => option.code === code)?.detailRequired ?? false
}

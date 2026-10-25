import { useOrderDetail, useOrderGroups, type OrderSegment } from '@/shared/order'

// 주문 데이터는 shared/order 어댑터(서버 GET /order-groups, GET /order-groups/{id},
// GET /orders/{orderId}, POST /orders/{orderPublicId}/confirm)가 단일 소스다.
// 구매확정·클레임 요청·철회·내역 조회는 화면이 shared의 훅(`useConfirmPurchase`·`useRequestClaim`·
// `useWithdrawClaim`·`useOrderClaims`·`useClaimReasons`)을 직접 쓴다 — 여기 한 겹 더 감싸지 않는다.

/** 세그먼트별 주문그룹 목록(커서 무한쿼리). */
export function useOrderList(segment: OrderSegment) {
  return useOrderGroups(segment)
}

/** 셀러 주문 상세. */
export function useOrder(orderId: string) {
  return useOrderDetail(orderId)
}

import { useOrderDetail, useOrderGroups, type OrderSegment } from '@/shared/order'

// 주문 데이터는 shared/order 어댑터(서버 GET /order-groups, GET /orders/{orderId})가 단일 소스다.
// 취소·구매확정 mutation은 BE 엔드포인트가 없어 제거됐다(목업 성공으로 상태를 바꾸지 않는다).

/** 세그먼트별 주문그룹 목록(커서 무한쿼리). */
export function useOrderList(segment: OrderSegment) {
  return useOrderGroups(segment)
}

/** 셀러 주문 상세. */
export function useOrder(orderId: string) {
  return useOrderDetail(orderId)
}

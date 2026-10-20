import { useOrderDetail, useOrderGroups, type OrderSegment } from '@/shared/order'

// 주문 데이터는 shared/order 어댑터(서버 GET /order-groups, GET /orders/{orderId},
// POST /orders/{orderPublicId}/confirm)가 단일 소스다. 구매확정 mutation은 상세 화면이
// `useConfirmPurchase`를 shared에서 직접 쓴다(여기 한 겹 더 감싸지 않는다).
// 취소·반품 요청 mutation은 사유 코드 어휘가 미확정이라(SCRUM-273) 아직 없다 — 진행 중 클레임은 읽기만 한다.

/** 세그먼트별 주문그룹 목록(커서 무한쿼리). */
export function useOrderList(segment: OrderSegment) {
  return useOrderGroups(segment)
}

/** 셀러 주문 상세. */
export function useOrder(orderId: string) {
  return useOrderDetail(orderId)
}

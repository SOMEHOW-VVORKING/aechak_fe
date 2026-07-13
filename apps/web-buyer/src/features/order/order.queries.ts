import { useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { BuyerOrder } from '@aechak/domain'
import {
  cancelOrder as cancelOrderInStore,
  confirmOrder as confirmOrderInStore,
  useOrders,
} from '@/shared/order'
import { filterOrdersBySegment, withCatalogThumbnails, type OrderSegment } from './order.mock'

// 주문 데이터는 shared/order 스토어(useSyncExternalStore)가 단일 소스다 — 서버 상태가 아니라
// 취소/구매확정/결제생성이 즉시 반영돼야 하는 클라이언트 상태라 찜/장바구니(Phase 1/2)처럼
// 셀렉터 훅으로 읽는다. 상태 전이(취소/확정)만 useMutation으로 감싸 확인 Modal/버튼 로딩을 준다.

/** 세그먼트로 거른 주문 목록(스토어 구독 + 파생). */
export function useOrderList(segment: OrderSegment): BuyerOrder[] {
  const orders = useOrders()
  return useMemo(
    () => filterOrdersBySegment(orders, segment).map(withCatalogThumbnails),
    [orders, segment],
  )
}

/** 단일 주문(스토어 구독 + 조회). 없으면 undefined. */
export function useOrder(id: string): BuyerOrder | undefined {
  const orders = useOrders()
  return useMemo(() => {
    const found = orders.find(o => o.id === id)
    return found ? withCatalogThumbnails(found) : undefined
  }, [orders, id])
}

// 주문 취소 mutation. 확인 Modal의 "취소하기" 버튼 로딩(isPending)을 위해 감쌌고, 지연 후
// 스토어를 갱신하면 상세/목록이 즉시 취소완료로 바뀐다.
export function useCancelOrder() {
  return useMutation<void, Error, string>({
    mutationFn: id =>
      new Promise(resolve => {
        setTimeout(() => {
          cancelOrderInStore(id)
          resolve()
        }, 600)
      }),
  })
}

// 구매확정 mutation. 배송완료 주문에서만 호출한다(화면에서 가드).
export function useConfirmOrder() {
  return useMutation<void, Error, string>({
    mutationFn: id =>
      new Promise(resolve => {
        setTimeout(() => {
          confirmOrderInStore(id)
          resolve()
        }, 600)
      }),
  })
}

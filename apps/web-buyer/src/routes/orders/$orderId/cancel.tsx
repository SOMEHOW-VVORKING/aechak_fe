import { createFileRoute, redirect } from '@tanstack/react-router'

// 주문 취소는 클레임 요청(취소 유형)으로 합쳐졌다 — BE가 취소·반품·교환을 한 경로
// (POST /orders/{id}/claims)로 받기 때문이다. 이 경로는 예전 링크·북마크를 위해 남겨 두고
// 새 화면으로 넘긴다(목업 시절의 취소 전용 화면은 삭제됐다).
export const Route = createFileRoute('/orders/$orderId/cancel')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/orders/$orderId/claim',
      params: { orderId: params.orderId },
      search: { type: 'cancel' },
      replace: true,
    })
  },
})

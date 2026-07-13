import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { resetOrders } from '@/shared/order'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('주문 라우트', () => {
  beforeEach(() => resetOrders())

  it('[AC-ORDER-ROUTE-001] /orders는 시드 주문 목록을 렌더한다', async () => {
    renderAt('/orders')
    expect(
      await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머'),
    ).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-002] /orders/$orderId는 주문 상세(주문번호·결제 정보)를 렌더한다', async () => {
    renderAt('/orders/20260710-0182')
    expect(await screen.findByText('20260710-0182')).toBeInTheDocument()
    expect(await screen.findByText('결제 정보')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-003] 배송 시작된 주문의 취소 화면은 취소 불가 안내를 보여준다', async () => {
    // 20260707-0132는 배송중 → 취소 불가.
    renderAt('/orders/20260707-0132/cancel')
    expect(await screen.findByText('취소할 수 없는 주문이에요')).toBeInTheDocument()
  })

  it('[AC-ORDER-ROUTE-004] 배송 전 주문의 취소 화면은 사유 선택 폼을 보여준다', async () => {
    // 20260710-0182는 결제완료 → 취소 가능.
    renderAt('/orders/20260710-0182/cancel')
    expect(await screen.findByText('배송 전이라 즉시 취소할 수 있어요')).toBeInTheDocument()
    expect(await screen.findByText('단순 변심')).toBeInTheDocument()
  })
})

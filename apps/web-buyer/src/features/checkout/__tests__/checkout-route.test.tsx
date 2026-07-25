import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetCart } from '@/shared/cart'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 @aechak/api fetcher로 서버에서 온다(훅 아님) — 여기선 빈 목록을 돌려주는 정적 목으로
// "배송지 없음" 상태를 재현한다(jsdom 네트워크 호출 없음). mutation fetcher는 이 화면이 호출하지 않는다.
vi.mock('@aechak/api', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getDeliveryAddresses: () => Promise.resolve({ data: { addresses: [], totalCount: 0 } }),
  }
})

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

describe('/checkout 배송지 없음 상태', () => {
  beforeEach(() => {
    resetCart()
  })

  it('[AC-CHECKOUT-005] 배송지가 없으면 배송지 추가 CTA를 보여주고 결제 버튼을 막는다', async () => {
    renderAt('/checkout')

    expect(
      await screen.findByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배송지 추가' })).toBeInTheDocument()
    // 배송지가 없으니 결제 버튼은 비활성이다
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-006] 배송지 추가 CTA는 배송지 관리 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/checkout')

    await user.click(await screen.findByRole('button', { name: '배송지 추가' }))
    expect(await screen.findByText('배송지 관리')).toBeInTheDocument()
  })
})

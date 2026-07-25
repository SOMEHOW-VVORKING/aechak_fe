import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetCart } from '@/shared/cart'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 @aechak/api fetcher로 서버에서 온다(훅 아님). jsdom엔 서버가 없으므로 목으로 대체하되,
// "빈 목록"과 "조회 실패"를 화면이 구분하는지 봐야 해서 테스트마다 응답을 갈아끼운다.
const addressFetch = vi.hoisted(() => ({
  impl: () => Promise.resolve({ data: { addresses: [], totalCount: 0 } }) as Promise<unknown>,
}))

vi.mock('@aechak/api', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getDeliveryAddresses: () => addressFetch.impl(),
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
    addressFetch.impl = () => Promise.resolve({ data: { addresses: [], totalCount: 0 } })
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

  it('[AC-CHECKOUT-007] 배송지 조회가 실패하면 "없음"이 아니라 조회 실패로 안내한다', async () => {
    // 실패를 "배송지 없음"으로 보여주면 등록된 주소가 사라진 줄 알고 중복 등록한다.
    addressFetch.impl = () => Promise.reject(new Error('network'))
    renderAt('/checkout')

    expect(await screen.findByText('배송지를 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.')).toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-006] 배송지 추가 CTA는 배송지 관리 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/checkout')

    await user.click(await screen.findByRole('button', { name: '배송지 추가' }))
    expect(await screen.findByText('배송지 관리')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { addToCart, resetCart } from '@/shared/cart'
import {
  DELIVERY_ADDRESSES_URL,
  POINTS_URL,
  seedDeliveryAddresses,
  seedPointBalance,
  server,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 MSW로 네트워크에서 가로챈다(모듈 모킹 X) — "빈 목록"과 "조회 실패"를 화면이
// 구분하는지 보려면 실제 HTTP 상태까지 태워야 한다.

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
    seedDeliveryAddresses([])
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
    server.use(http.get(DELIVERY_ADDRESSES_URL, () => HttpResponse.error()))
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

describe('/checkout 적립금 사용 한도(서버 잔액)', () => {
  beforeEach(() => {
    resetCart()
    seedDeliveryAddresses([])
    seedPointBalance(0)
    // 목업 카탈로그 상품을 담아 결제금액을 만든다(주문 자체는 아직 목업). p-churu = 13,900원.
    addToCart('p-churu', '기본', 1)
  })

  it('[AC-POINT-CHECKOUT-004] 사용 한도는 서버 잔액이다(잔액 < 주문금액이면 최대 = 잔액)', async () => {
    seedPointBalance(700)
    renderAt('/checkout')

    // 보유·최대 사용 모두 서버 잔액(700)으로 제한된다 — 주문금액(13,900)이 아니라 잔액이 상한.
    expect(await screen.findByText('보유 700원')).toBeInTheDocument()
    expect(await screen.findByText('최대 700원까지 사용할 수 있어요')).toBeInTheDocument()
  })

  it('[AC-POINT-CHECKOUT-005] 잔액 조회 실패 시 사용 가능 0으로 강하하고 화면은 계속 동작한다', async () => {
    seedPointBalance(700)
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    renderAt('/checkout')

    // 잔액을 못 읽으면 0으로 안전 강하 — 전액사용 비활성, 화면(결제 버튼)은 그대로 렌더.
    expect(await screen.findByText('보유 0원')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeInTheDocument()
  })
})

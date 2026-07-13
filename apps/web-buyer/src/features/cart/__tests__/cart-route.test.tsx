import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { cartLineKey, removeFromCart, resetCart } from '@/shared/cart'
import { logout, resetAuth } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'

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

describe('/cart', () => {
  beforeEach(() => {
    resetCart()
    resetAuth()
  })

  it('[AC-CART-ROUTE-001] 셀러 그룹과 결제예정금액을 보여주고 품절 상품을 표기한다', async () => {
    renderAt('/cart')
    expect(await screen.findByText('냥이상점')).toBeInTheDocument()
    expect(screen.getByText('멍멍마트')).toBeInTheDocument()
    expect(screen.getByText('결제예정금액')).toBeInTheDocument()
    expect(screen.getByText('품절')).toBeInTheDocument()
    // 선택된 라인 1개 → 주문하기 (1)
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-002] 수량을 늘리면 결제예정금액이 실시간으로 갱신된다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드 급식기 64,000원 → +1 → 128,000원
    await user.click(screen.getByRole('button', { name: '증가' }))
    expect(await screen.findAllByText('128,000원')).not.toHaveLength(0)
  })

  it('[AC-CART-ROUTE-003] 전체 선택을 모두 해제하면 주문하기 버튼이 비활성화된다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드는 급식기만 선택된 (1/2) 상태(품절 스크래쳐 미선택) → 한 번 누르면 품절 포함 전체
    // 선택(2/2), 다시 누르면 전체 해제(0/2)라 주문하기가 (0)으로 비활성화된다.
    const selectAll = () => screen.getByRole('checkbox', { name: /전체 선택/ })
    await user.click(selectAll())
    await user.click(selectAll())
    expect(screen.getByRole('button', { name: '주문하기 (0)' })).toBeDisabled()
  })

  it('[AC-GATE-002] 비회원이 주문하기를 누르면 게이트가 뜨고 결제로 넘어가지 않는다', async () => {
    const user = userEvent.setup()
    logout()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    // 게이트가 뜨고, 여전히 장바구니 화면(주문서로 이동하지 않음).
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeInTheDocument()
    expect(screen.queryByText('주문서')).not.toBeInTheDocument()
  })

  it('[AC-GATE-003] 회원이 주문하기를 누르면 결제(주문서) 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    // 기본 로그인 상태(beforeEach의 resetAuth) — 게이트 없이 바로 주문서로 이동.
    renderAt('/cart')
    await screen.findByText('냥이상점')

    await user.click(screen.getByRole('button', { name: '주문하기 (1)' }))

    expect(await screen.findByText('주문서')).toBeInTheDocument()
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()
  })

  it('[AC-CART-ROUTE-004] 품절 라인만 남아도 전체 선택 체크박스가 활성화된다(품절도 선택 가능)', async () => {
    // 선택 가능한 급식기를 제거하면 품절 스크래쳐만 남는다.
    removeFromCart(cartLineKey('p-feeder-5l', '용량 5L / 화이트'))
    renderAt('/cart')

    const selectAll = await screen.findByRole('checkbox', { name: /전체 선택/ })
    // 이제 품절도 체크/삭제 대상이라 전체 선택은 활성 상태(예전엔 비활성이었다).
    expect(selectAll).toBeEnabled()
  })

  it('[AC-CART-SOLDOUT-001] 품절 상품이 선택되면 주문하기가 비활성화되고 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드는 품절 미선택 → 주문하기 (1) 활성, 안내 없음.
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    expect(screen.queryByText('품절 상품이 포함되어 주문할 수 없어요')).not.toBeInTheDocument()

    // 품절 스크래쳐가 있는 멍멍마트 그룹을 선택 → 주문하기 비활성 + 안내.
    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    expect(screen.getByRole('button', { name: /주문하기/ })).toBeDisabled()
    expect(screen.getByText('품절 상품이 포함되어 주문할 수 없어요')).toBeInTheDocument()
  })

  it('[AC-CART-SOLDOUT-002] 품절 상품을 선택해 선택 삭제로 지울 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/cart')
    await screen.findByText('멍멍마트')
    expect(screen.getByText('품절')).toBeInTheDocument()

    // 시드는 급식기가 선택돼 있으니 냥이상점 그룹을 먼저 해제해 품절 스크래쳐만 선택되게 한다.
    await user.click(screen.getByRole('checkbox', { name: '냥이상점' }))
    // 품절 스크래쳐가 있는 멍멍마트 그룹을 선택 → 선택 삭제.
    await user.click(screen.getByRole('checkbox', { name: '멍멍마트' }))
    await user.click(screen.getByRole('button', { name: '선택 삭제' }))

    // 품절 라인이 사라지고 냥이상점(급식기)은 그대로 남는다.
    expect(screen.queryByText('품절')).not.toBeInTheDocument()
    expect(screen.queryByText('멍멍마트')).not.toBeInTheDocument()
    expect(screen.getByText('냥이상점')).toBeInTheDocument()
  })

  it('[AC-CART-SOLDOUT-003] 품절을 빼고 선택하면 주문하기가 활성이고 합계에 품절이 빠진다', async () => {
    renderAt('/cart')
    await screen.findByText('냥이상점')

    // 시드 기본: 급식기만 선택(품절 스크래쳐 미선택) → 주문하기 (1) 활성.
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toBeEnabled()
    // 합계는 급식기 64,000원만 — 품절 29,000원을 더한 93,000원은 어디에도 없다.
    expect(screen.getAllByText('64,000원').length).toBeGreaterThan(0)
    expect(screen.queryByText('93,000원')).not.toBeInTheDocument()
  })
})

import { StrictMode, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { getOrders, resetOrders } from '@/shared/order'
import { resetCart } from '@/shared/cart'
import { generateOrderNo } from '../payment.mock'

function renderAt(path: string, { strict = false }: { strict?: boolean } = {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

// 같은 금액 두 바로구매(둘 다 무료배송, amount 64,000): 급식기 1개 vs 관절영양제 2개.
const BUY_FEEDER =
  '/payment/result?source=buynow&buyNow=p-feeder-5l&option=기본&qty=1&method=kakaopay&amount=64000'
const BUY_JOINT_X2 =
  '/payment/result?source=buynow&buyNow=p-joint-90&option=기본&qty=2&method=kakaopay&amount=64000'

describe('결제 → 주문 생성: 주문번호 유일성', () => {
  beforeEach(() => {
    resetOrders()
    resetCart()
  })

  it('[AC-PAYMENT-006] generateOrderNo는 호출마다 유일한 주문번호를 만든다', () => {
    const a = generateOrderNo()
    const b = generateOrderNo()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^\d{8}-\d{4}$/)
  })

  it('[AC-PAYMENT-007] 금액이 같은 서로 다른 구매는 별개 주문번호로 각각 남는다', async () => {
    const seedIds = new Set(getOrders().map(o => o.id))
    const seedCount = seedIds.size

    // 구매 1
    const r1 = renderAt(BUY_FEEDER)
    expect(await r1.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    r1.unmount()

    // 구매 2 (금액 동일)
    const r2 = renderAt(BUY_JOINT_X2)
    expect(await r2.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    r2.unmount()

    const orders = getOrders()
    const newOrders = orders.filter(o => !seedIds.has(o.id))
    // 예전 금액-파생 방식이면 두 주문이 같은 id로 충돌해 한 건만 남았다. 이제 둘 다 남아야 한다.
    expect(newOrders).toHaveLength(2)
    expect(new Set(newOrders.map(o => o.id)).size).toBe(2)
    expect(orders).toHaveLength(seedCount + 2)
    // 각 주문이 자기 상품을 담고 있다(엉뚱한 주문으로 덮어써지지 않음).
    const productIds = newOrders.map(o => o.groups[0]?.items[0]?.productId).sort()
    expect(productIds).toEqual(['p-feeder-5l', 'p-joint-90'])
  })

  it('[AC-PAYMENT-008] 같은 결제의 StrictMode 이중 실행은 주문을 정확히 1건만 만든다', async () => {
    const seedCount = getOrders().length

    const r = renderAt(BUY_FEEDER, { strict: true })
    expect(await r.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    // StrictMode 이중 이펙트의 두 번째 결제 발화까지 정산되도록 충분히 대기(setTimeout 1200ms 기반).
    await new Promise(res => setTimeout(res, 500))

    // 인스턴스당 주문번호가 하나라 두 발화가 같은 id로 upsert → 유령/중복 주문 없이 1건.
    expect(getOrders()).toHaveLength(seedCount + 1)
    r.unmount()
  })

  it('[AC-PAYMENT-009] 결제 완료 후 뒤로가기는 결제 화면을 재진입하지 않는다(replace)', async () => {
    const user = userEvent.setup()
    // 장바구니 위에서 결제 결과로 진입한 세션. 결제 화면을 replace로 나가면 뒤로가기가
    // 진행/결과 화면을 재진입(결제 재실행)하지 않고 장바구니로 돌아가야 한다.
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/cart', BUY_FEEDER] }),
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '주문 상세 보기' }))
    expect(await screen.findByText('주문 상세')).toBeInTheDocument()

    // 뒤로가기 → 결제 진행/완료 화면이 아니라 그 이전(장바구니)로 간다
    router.history.back()
    expect(await screen.findByText('결제예정금액')).toBeInTheDocument()
    expect(screen.queryByText('결제를 진행하고 있어요')).not.toBeInTheDocument()
    expect(screen.queryByText('결제가 완료되었어요')).not.toBeInTheDocument()
  })
})

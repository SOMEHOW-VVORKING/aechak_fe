import { StrictMode, type ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { paymentCallCounts, seedPaymentState } from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 결제 확정(complete)의 호출 규율 — 동시 중복은 한 번, 재진입은 다시, 성공 뒤 캐시 무효화·replace 이동.
vi.mock('@portone/browser-sdk/v2', () => ({ requestPayment: vi.fn() }))

const OG = '01JPAYORDER000000000000001'
const RESULT_URL = `/payment/result?orderGroupId=${OG}&method=kakaopay`

function renderAt(
  entries: string[],
  {
    strict = false,
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  } = {},
) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: entries }),
  })
  const tree: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  return { ...view, router, queryClient }
}

describe('결제 확정 호출 규율', () => {
  it('[AC-PAYMENT-008] StrictMode 이중 마운트에서도 complete는 한 번만 나간다', async () => {
    seedPaymentState({ [OG]: {} })
    const view = renderAt([RESULT_URL], { strict: true })

    expect(await view.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(paymentCallCounts(OG).complete).toBe(1)
  })

  it('[AC-PAYMENT-017] 화면을 다시 열면(새로고침·재진입) complete를 다시 물어 서버 상태를 따른다', async () => {
    seedPaymentState({ [OG]: {} })
    const first = renderAt([RESULT_URL])
    expect(await first.findByText('결제가 완료되었어요')).toBeInTheDocument()
    first.unmount()

    const second = renderAt([RESULT_URL])
    expect(await second.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(paymentCallCounts(OG).complete).toBe(2)
  })

  it('[AC-PAYMENT-020] PAID면 장바구니·주문 목록·적립금 캐시를 무효화한다', async () => {
    seedPaymentState({ [OG]: {} })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['cart'], { stale: true })
    queryClient.setQueryData(['order-groups', 'all'], { stale: true })
    queryClient.setQueryData(['points', 'balance'], { data: { balance: 0 } })
    const view = renderAt([RESULT_URL], { queryClient })

    expect(await view.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(queryClient.getQueryState(['cart'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['order-groups', 'all'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['points', 'balance'])?.isInvalidated).toBe(true)
  })

  it('[AC-PAYMENT-021] FAILED면 서버가 장바구니를 지우지 않으므로 캐시도 건드리지 않는다', async () => {
    seedPaymentState({ [OG]: { completeSequence: ['FAILED'] } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['cart'], { stale: false })
    const view = renderAt([RESULT_URL], { queryClient })

    expect(await view.findByText('결제에 실패했어요')).toBeInTheDocument()
    expect(queryClient.getQueryState(['cart'])?.isInvalidated).toBe(false)
  })

  it('[AC-PAYMENT-009] 결제 완료 후 뒤로가기는 결제 화면을 재진입하지 않는다(replace)', async () => {
    const user = userEvent.setup()
    seedPaymentState({ [OG]: {} })
    const { router } = renderAt(['/cart', RESULT_URL])

    expect(await screen.findByText('결제가 완료되었어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '주문 내역 보기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'))

    router.history.back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
    expect(screen.queryByText('결제를 확인하고 있어요')).not.toBeInTheDocument()
    expect(screen.queryByText('결제가 완료되었어요')).not.toBeInTheDocument()
    // 결제 화면이 히스토리에 남지 않았으니 complete도 다시 나가지 않는다.
    expect(paymentCallCounts(OG).complete).toBe(1)
  })
})

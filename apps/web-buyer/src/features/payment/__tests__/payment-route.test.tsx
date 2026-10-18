import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentCallCounts, seedPaymentState } from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 결제 결과 화면(/payment/result) ↔ POST complete 연동. 포트원 SDK는 모듈 모킹, 서버는 MSW 시드.
const sdk = vi.hoisted(() => ({ requestPayment: vi.fn() }))
vi.mock('@portone/browser-sdk/v2', () => ({ requestPayment: sdk.requestPayment }))

const OG = '01JPAYTEST0000000000000001'
const RESULT_URL = `/payment/result?orderGroupId=${OG}&method=kakaopay`

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router }
}

describe('/payment/result', () => {
  beforeEach(() => {
    sdk.requestPayment.mockReset()
  })

  it('[AC-PAYMENT-004] 서버가 PAID를 주면 주문번호·결제금액을 보여주고 뒤로가기 없이 CTA만 둔다', async () => {
    seedPaymentState({ [OG]: { finalPaymentAmount: 61000, usedPoint: 3000 } })
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(screen.getByText(OG)).toBeInTheDocument()
    expect(screen.getByText('61,000원')).toBeInTheDocument()
    expect(screen.getByText('-3,000원')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '뒤로 가기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '홈으로' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주문 내역 보기' })).toBeInTheDocument()
  })

  it('[AC-PAYMENT-005] 주문그룹 없이 진입하면 complete를 부르지 않고 /cart로 보낸다', async () => {
    seedPaymentState({ [OG]: {} })
    const { router } = renderAt('/payment/result')

    await waitFor(() => expect(router.state.location.pathname).toBe('/cart'))
    expect(screen.queryByText('결제를 확인하고 있어요')).not.toBeInTheDocument()
    expect(paymentCallCounts(OG).complete).toBe(0)
  })

  it('[AC-PAYMENT-010] 실패 화면은 뒤로가기(←)를 남기고 장바구니로/다시 시도를 둔다', async () => {
    seedPaymentState({
      [OG]: { completeSequence: [{ status: 'FAILED', failureCode: 'PG_DECLINED' }] },
    })
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제에 실패했어요')).toBeInTheDocument()
    expect(screen.getByText(/승인을 거절했어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '장바구니로' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-PAYMENT-011] 다시 시도는 prepare→결제창→complete를 같은 수단으로 다시 돌려 성공으로 넘어간다', async () => {
    const user = userEvent.setup()
    seedPaymentState({ [OG]: { completeSequence: ['FAILED', 'PAID'], finalPaymentAmount: 64000 } })
    sdk.requestPayment.mockResolvedValue({
      transactionType: 'PAYMENT',
      txId: 'tx-1',
      paymentId: OG,
    })
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제에 실패했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(paymentCallCounts(OG)).toEqual({ prepare: 1, complete: 2 })
    expect(sdk.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: OG,
        totalAmount: 64000,
        easyPay: { easyPayProvider: 'KAKAOPAY' },
      }),
    )
  })

  it('[AC-PAYMENT-018] 결제창을 취소하면 실패 화면에 남아 안내하고 complete를 다시 묻지 않는다', async () => {
    const user = userEvent.setup()
    seedPaymentState({ [OG]: { completeSequence: ['NOT_STARTED'] } })
    sdk.requestPayment.mockResolvedValue({
      transactionType: 'PAYMENT',
      txId: 'tx-1',
      paymentId: OG,
      code: 'FAILURE_TYPE_PG',
      message: '사용자가 결제를 취소하셨습니다',
    })
    renderAt(RESULT_URL)

    expect(
      await screen.findByText('결제가 시작되지 않았어요. 다시 시도해 주세요'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(/결제를 취소했어요/)).toBeInTheDocument()
    expect(screen.getByText('결제에 실패했어요')).toBeInTheDocument()
    expect(paymentCallCounts(OG)).toEqual({ prepare: 1, complete: 1 })
  })

  it('[AC-PAYMENT-022] 다시 시도의 prepare가 60006(이미 결제됨)이면 결제창 없이 complete를 다시 물어 완료 화면으로 간다', async () => {
    const user = userEvent.setup()
    // 첫 complete는 FAILED, 그 사이 다른 탭에서 결제가 끝나 prepare는 409 60006 — complete는 PAID를 멱등 재반환.
    seedPaymentState({
      [OG]: {
        prepare: { error: { status: 409, errorCode: 60006 } },
        completeSequence: ['FAILED', 'PAID'],
        finalPaymentAmount: 64000,
      },
    })
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제에 실패했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('결제가 완료되었어요')).toBeInTheDocument()
    expect(screen.getByText('64,000원')).toBeInTheDocument()
    expect(screen.queryByText('이미 결제가 완료된 주문이에요')).not.toBeInTheDocument()
    expect(paymentCallCounts(OG)).toEqual({ prepare: 1, complete: 2 })
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-PAYMENT-023] 다시 시도의 prepare가 60009(만료)면 장바구니로 안내하고 다시 시도 버튼을 숨긴다', async () => {
    const user = userEvent.setup()
    seedPaymentState({
      [OG]: {
        prepare: { error: { status: 409, errorCode: 60009 } },
        completeSequence: ['FAILED'],
      },
    })
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제에 실패했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(
      await screen.findByText('결제 가능 시간이 지났어요. 장바구니에서 다시 주문해 주세요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '장바구니로' })).toBeInTheDocument()
    expect(paymentCallCounts(OG)).toEqual({ prepare: 1, complete: 1 })
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-PAYMENT-016] 60010 같은 대조 실패는 재시도 없이 고객센터 안내로 끝낸다', async () => {
    seedPaymentState({ [OG]: { completeSequence: [{ error: { status: 409, errorCode: 60010 } }] } })
    renderAt(RESULT_URL)

    expect(await screen.findByText('확인이 필요한 결제예요')).toBeInTheDocument()
    expect(screen.getByText(/고객센터로 문의해 주세요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '고객센터 문의' })).toBeInTheDocument()
    expect(paymentCallCounts(OG).complete).toBe(1)
  })

  it('[AC-PAYMENT-019] 시드도 생성 기록도 없는 주문(404)은 확인 실패 화면으로 보여준다', async () => {
    renderAt(RESULT_URL)

    expect(await screen.findByText('결제 결과를 확인하지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('주문 정보를 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument()
  })
})

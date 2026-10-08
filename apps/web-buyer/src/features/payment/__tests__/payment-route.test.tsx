import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetCart } from '@/shared/cart'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 MSW 기본 핸들러(빈 목록)가 응답한다 — 이 테스트 단언은 주문 라인만 본다.

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

describe('/payment/result', () => {
  beforeEach(() => {
    resetCart()
  })

  it('[AC-PAYMENT-004] 바로구매 결제 실패 후 결제수단 변경은 그 바로구매 주문으로 돌아간다(장바구니 합계 청구 안 함)', async () => {
    const user = userEvent.setup()
    // 하네스(19,900) 바로구매 → 배송비 3,000 → 22,900원, 카드 결제라 실패
    renderAt(
      '/payment/result?source=buynow&buyNow=p-harness-y&option=기본&qty=1&method=card&amount=22900',
    )

    expect(await screen.findByText('결제에 실패했어요', {}, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '결제수단 변경' }))

    // 바로구매 주문서로 복귀: 하네스 단일 상품이 보이고, 장바구니 시드 급식기(64,000)는 안 보인다.
    expect(await screen.findByText(/하네스/)).toBeInTheDocument()
    expect(screen.queryByText(/급식기/)).not.toBeInTheDocument()
  })

  it('[AC-PAYMENT-005] 유효한 주문 세션 없이 진입하면 결제를 발화하지 않고 /cart로 보낸다(장바구니 유지)', async () => {
    // 파라미터 없이 진입 → amount 0 → 무효 → /cart 리다이렉트, 결제 미발화
    renderAt('/payment/result')

    expect(await screen.findByText('결제예정금액')).toBeInTheDocument() // 장바구니 화면
    expect(screen.queryByText('결제가 완료되었어요')).not.toBeInTheDocument() // 가짜 결제 미표시
    expect(screen.getByText(/급식기/)).toBeInTheDocument() // 시드 장바구니 라인 유지
  })

  it('[AC-PAYMENT-010] 결제 완료 화면엔 뒤로가기(←)가 없고, 실패 화면엔 남는다', async () => {
    // 성공(카카오페이) — 완료 화면은 뒤로가기(←) 어포던스를 두지 않는다.
    // 이전을 누르면 주문서/장바구니로 돌아가므로 이동은 '홈으로'/'주문 상세 보기' CTA로만.
    const ok = renderAt(
      '/payment/result?source=buynow&buyNow=p-feeder-5l&option=기본&qty=1&method=kakaopay&amount=64000',
    )
    expect(await ok.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(ok.queryByRole('button', { name: '뒤로 가기' })).not.toBeInTheDocument()
    expect(ok.getByRole('button', { name: '홈으로' })).toBeInTheDocument()
    expect(ok.getByRole('button', { name: '주문 상세 보기' })).toBeInTheDocument()
    ok.unmount()

    // 실패(카드) — 장바구니로 돌아가 재시도해야 하므로 뒤로가기(←)는 유지.
    const fail = renderAt(
      '/payment/result?source=buynow&buyNow=p-feeder-5l&option=기본&qty=1&method=card&amount=64000',
    )
    expect(await fail.findByText('결제에 실패했어요', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(fail.getByRole('button', { name: '뒤로 가기' })).toBeInTheDocument()
  })

  it('[AC-PAYMENT-011] 결제 실패 화면은 성공 화면처럼 큰 결과 형태로 세로 중앙 정렬된다', async () => {
    // 실패(카드) — 작은 Alert 배너가 아니라 원형 아이콘 + 큰 제목 + 회색 서브텍스트(실패 사유)를
    // flex-1 영역에서 세로 중앙 정렬(items-center justify-center)해 성공 화면과 정렬 리듬을
    // 맞춘다(L-5). 제목 텍스트로 앵커하고(제목은 공용 ResultHero 블록 안에 있다) 그 블록을 감싼
    // 콘텐츠 영역의 중앙 정렬 속성을 확인한다.
    const fail = renderAt(
      '/payment/result?source=buynow&buyNow=p-feeder-5l&option=기본&qty=1&method=card&amount=64000',
    )
    const title = await fail.findByText('결제에 실패했어요', {}, { timeout: 3000 })
    // 실패 사유가 서브텍스트로 함께 보인다(작은 Alert 배너가 아니라 큰 결과 형태).
    expect(fail.getByText('카드 한도를 확인한 뒤 다시 시도해 주세요.')).toBeInTheDocument()
    const content = title.parentElement?.parentElement
    expect(content).toHaveClass('flex-1', 'flex-col', 'items-center', 'justify-center')
  })
})

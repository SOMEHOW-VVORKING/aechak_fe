import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { resetOrders } from '@/shared/order'
import { resetReviews } from '@/shared/review'
import { resetAccount } from '@/shared/account'

function renderAt(path: string) {
  return renderHistory([path])
}

function renderHistory(entries: string[]) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: entries }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('리뷰 라우트', () => {
  beforeEach(() => {
    resetOrders()
    resetReviews()
    resetAccount()
  })

  it('[AC-REVIEW-ROUTE-001] /reviews/mine은 대기/완료 탭과 개수를 렌더한다', async () => {
    // 시드: 작성 대기 3(배송완료 리드줄·노즈워크 + 구매확정 관절), 작성 완료 2(시드 리뷰).
    renderAt('/reviews/mine')
    expect(await screen.findByText('작성 대기 3')).toBeInTheDocument()
    expect(await screen.findByText('작성 완료 2')).toBeInTheDocument()
    expect(await screen.findByText('자동 리드줄 5m 대형견용')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-002] /reviews/write는 대상 상품과 별점 입력을 렌더한다', async () => {
    renderAt('/reviews/write?productId=p-leash-5m&orderId=20260703-0098')
    expect(await screen.findByText('상품은 만족하셨나요?')).toBeInTheDocument()
    expect(await screen.findByText('자동 리드줄 5m 대형견용')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-003] /reviews/product/$productId는 리뷰 요약과 목록을 렌더한다', async () => {
    renderAt('/reviews/product/p-feeder-5l')
    expect(await screen.findByText('집사**')).toBeInTheDocument()
    // 리뷰 '구매' 인증 pill 제거(소비측에서 verifiedPurchase 미전달)
    expect(screen.queryByText('구매')).not.toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-005] 리뷰 사진을 탭하면 확대 뷰어(라이트박스)가 열린다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews/product/p-feeder-5l')
    await screen.findByText('집사**')

    const photoButtons = await screen.findAllByRole('button', { name: /리뷰 사진 \d+ 확대 보기/ })
    expect(screen.queryByRole('dialog', { name: '리뷰 사진 확대 보기' })).not.toBeInTheDocument()

    await user.click(photoButtons[0]!)
    expect(
      await screen.findByRole('dialog', { name: '리뷰 사진 확대 보기' }),
    ).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-006] 상품 리뷰 목록에서 내 리뷰는 닉네임 + 수정/삭제로 뜬다', async () => {
    // 시드 리뷰 rv-seed-1(author: 나)이 p-feeder-5l 목록에 얹힌다 → 작성자는 '나'가 아니라
    // 내 계정 닉네임(코코집사)으로 표기되고, 그 카드에만 수정/삭제 버튼이 붙는다.
    renderAt('/reviews/product/p-feeder-5l')
    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.queryByText('나')).not.toBeInTheDocument()
    // 다른 구매자 목업 리뷰는 그대로(닉네임 유지, 수정/삭제 없음).
    expect(screen.getByText('집사**')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-007] 상품 리뷰 목록에서 내 리뷰를 삭제하면 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews/product/p-feeder-5l')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '삭제' }))
    // 확인 모달 → 삭제하기
    expect(await screen.findByText('리뷰를 삭제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제하기' }))

    // 내 리뷰가 목록에서 사라진다(닉네임/수정·삭제 버튼 제거). 다른 리뷰는 유지.
    await waitFor(() => expect(screen.queryByText('코코집사')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.getByText('집사**')).toBeInTheDocument()
  })

  it('[AC-REVIEW-ROUTE-004] 리뷰 수정 완료 후 뒤로가기는 수정 화면을 재진입하지 않는다(replace)', async () => {
    const user = userEvent.setup()
    // 내 리뷰 목록 위에서 시드 리뷰(rv-seed-1) 수정 화면으로 진입한 세션.
    const router = renderHistory(['/reviews/mine', '/reviews/write?reviewId=rv-seed-1'])

    // 수정 화면(별점 프리필로 '리뷰 수정' 즉시 활성)이 뜬다.
    expect(await screen.findByText('상품은 만족하셨나요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '리뷰 수정' }))

    // 저장 완료 → 내 리뷰(완료 탭)로 이동.
    expect(await screen.findByText('작성 완료 2', {}, { timeout: 3000 })).toBeInTheDocument()

    // 뒤로가기 → 수정 화면을 replace로 빠져나왔으니 그 이전(내 리뷰)로 가야 한다.
    router.history.back()
    expect(await screen.findByText('작성 대기 3')).toBeInTheDocument()
    expect(screen.queryByText('상품은 만족하셨나요?')).not.toBeInTheDocument()
  })
})

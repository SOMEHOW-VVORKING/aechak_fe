import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('/products/$productId', () => {
  it('[AC-PRODUCT-005] 존재하는 상품은 상세를 렌더한다', async () => {
    renderAt('/products/p-feeder-5l')
    expect(await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-006] 알 수 없는 productId는 not-found 상태를 렌더한다', async () => {
    renderAt('/products/does-not-exist')
    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-007] 카테고리(중분류) breadcrumb를 누르면 해당 카테고리 마켓으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    // 마지막 crumb('식기/급수기')만 카탈로그 중분류와 매칭돼 버튼이다(상위 crumb는 정적 텍스트).
    await user.click(screen.getByRole('button', { name: '식기/급수기' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/market')
    })
    expect(router.state.location.search).toMatchObject({ category: '식기/급수기' })
  })

  it('[AC-PRODUCT-008] 상세 정리: 판매중/SALE pill·가격 밑 총별점 링크·리뷰 정렬 칩이 없다', async () => {
    renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    // item 1: 판매중/SALE 상태 pill 줄 제거(할인% 표기는 가격 블록에 유지)
    expect(screen.queryByText('판매중')).not.toBeInTheDocument()
    expect(screen.queryByText(/SALE/)).not.toBeInTheDocument()
    expect(screen.getByText('28%')).toBeInTheDocument()
    expect(screen.getByText('89,000원')).toBeInTheDocument()

    // item 3: 가격 바로 아래 "총별점 / 5 · 리뷰 N건" 요약 링크 제거
    expect(screen.queryByText('/ 5')).not.toBeInTheDocument()

    // item 5: 리뷰 섹션 정렬 칩 제거 + 전체보기는 유지
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText('별점높은순')).not.toBeInTheDocument()
    expect(screen.queryByText('포토리뷰만')).not.toBeInTheDocument()
    expect(screen.getByText('전체보기')).toBeInTheDocument()

    // 리뷰 '구매' 인증 pill 제거(소비측에서 verifiedPurchase 미전달) — '구매하기' 버튼은 별개라 유지
    expect(screen.queryByText('구매')).not.toBeInTheDocument()
    expect(screen.getByText('구매하기')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-009] 상세 리뷰는 최대 3개만 노출하고 나머지는 전체보기로 넘긴다', async () => {
    renderAt('/products/p-feeder-5l')
    await screen.findByText('고양이 자동 급식기 스마트 5L 앱 연동 타이머')

    // mock 리뷰 4건 중 상위 3건만 미리보기로 렌더 → 4번째('보리****')는 상세에 없다.
    expect(screen.getByText('코코****')).toBeInTheDocument()
    expect(screen.getByText('멍멍****')).toBeInTheDocument()
    expect(screen.getByText('하늘****')).toBeInTheDocument()
    expect(screen.queryByText('보리****')).not.toBeInTheDocument()
  })
})

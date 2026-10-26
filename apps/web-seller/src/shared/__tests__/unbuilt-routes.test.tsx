import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../routeTree.gen'

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

const UNBUILT = [
  ['/inquiries', '고객 문의', '고객 문의는 준비 중이에요'],
  ['/reviews', '리뷰 관리', '리뷰 관리는 준비 중이에요'],
  ['/coupons', '혜택/쿠폰/할인', '혜택/쿠폰/할인은 준비 중이에요'],
  ['/notices', '알림/공지', '알림/공지는 준비 중이에요'],
  ['/account', '계정/보안', '계정/보안은 준비 중이에요'],
] as const

// nav에만 이름이 있고 라우트 파일은 한 번도 없던 다섯 화면. 메뉴는 되살리되(사장님이 보고 싶어
// 하는 것이 메뉴 구성 자체다) seller BE가 없다는 사실을 운영자가 속지 않게 드러내야 한다 —
// "준비 중" 꼬리표 + 안내 화면이고, 그럴듯한 데이터 행은 그리지 않는다(AGENTS.md 규약 10).
describe('라우트가 없던 셀러 화면 신설', () => {
  it.each(UNBUILT)(
    '[AC-SELLER-UNBUILT-001] %s 는 제목·준비 중 안내·들어올 항목을 보여주고 지어낸 데이터 행은 그리지 않는다',
    async (path, title, message) => {
      renderAt(path)

      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(screen.getByText('이 화면에 들어올 것')).toBeInTheDocument()

      // 표·행·저장 버튼이 하나라도 그려지면 운영자가 실제 데이터로 오해한다.
      expect(screen.queryAllByRole('row')).toHaveLength(0)
      expect(screen.queryAllByRole('columnheader')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    },
  )

  it('[AC-SELLER-UNBUILT-002] 다섯 항목이 nav에 "준비 중" 꼬리표와 함께 올라온다', async () => {
    renderAt('/inquiries')

    // 꼬리표 텍스트가 버튼 안에 있어 접근성 이름이 "<항목> 준비 중"이 된다 — 꼬리표가 빠지면 이름이
    // 달라져 이 단정이 깨진다(꼬리표 유무를 이름으로 검증하는 셈).
    expect(await screen.findByRole('button', { name: '고객 문의 준비 중' })).toBeInTheDocument()
    for (const label of ['리뷰 관리', '혜택/쿠폰/할인', '알림/공지', '계정/보안']) {
      expect(screen.getByRole('button', { name: `${label} 준비 중` })).toBeInTheDocument()
    }
  })

  it('[AC-SELLER-UNBUILT-003] 서버가 붙어 있는 항목에는 꼬리표가 붙지 않는다', async () => {
    renderAt('/inquiries')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '스토어 설정' })).toBeInTheDocument()
  })

  // 준비 중 화면에도 "지금 할 수 있는 것"으로 가는 길은 둔다 — 쿠폰의 상품별 할인가는 상품 폼에,
  // 계정의 사업자 정보·서류는 스토어 설정에 이미 붙어 있다. 죽은 버튼이 아니라 실제로 이동한다.
  it('[AC-SELLER-UNBUILT-004] 쿠폰 화면의 안내 버튼은 상품 관리로 실제 이동한다', async () => {
    const router = renderAt('/coupons')

    fireEvent.click(await screen.findByRole('button', { name: '상품 관리로' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/products'))
  })

  it('[AC-SELLER-UNBUILT-005] 계정 화면의 안내 버튼은 스토어 설정으로 실제 이동한다', async () => {
    const router = renderAt('/account')

    fireEvent.click(await screen.findByRole('button', { name: '스토어 설정으로' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/store-settings'))
  })
})

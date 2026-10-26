import { render, screen } from '@testing-library/react'
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

// seller 모듈에 API가 없는 화면(대시보드/주문/클레임/정산/배송 정책)은 목업만 있어 운영 진입을 막는다 —
// nav에서 빠지고, 주소로 직접 들어와도 "준비 중" 안내만 보여주며 목업 데이터·저장 버튼을 그리지 않는다.
describe('목업 화면 진입 차단', () => {
  it('[AC-SELLER-GATE-001] 대시보드(/)는 준비 중 안내와 상품 관리 이동만 보여주고 목업 지표를 그리지 않는다', async () => {
    renderAt('/')

    expect(await screen.findByText('대시보드는 준비 중이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 관리로' })).toBeInTheDocument()
    expect(screen.queryByText(/최근 7일/)).not.toBeInTheDocument()
  })

  it.each([
    ['/orders', '주문/배송 관리는 준비 중이에요', '발송 처리'],
    ['/claims', '취소/반품/교환 관리는 준비 중이에요', '취소'],
    ['/settlements', '정산/매출 조회는 준비 중이에요', '최종정산금액'],
    ['/shipping-policy', '배송 정책 설정은 준비 중이에요', '저장'],
  ])(
    '[AC-SELLER-GATE-002] %s 직접 진입은 준비 중 안내만 보여준다',
    async (path, message, mockUi) => {
      renderAt(path)

      expect(await screen.findByText(message)).toBeInTheDocument()
      // 목업 화면의 버튼/탭/표 머리글(mockUi)이 함께 그려지면 안 된다.
      expect(screen.queryByRole('button', { name: mockUi })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: mockUi })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: mockUi })).not.toBeInTheDocument()
    },
  )

  // 문의/리뷰/쿠폰/공지/계정은 SCRUM-301에서 nav로 복원됐다("준비 중" 배지 + 안내 화면) —
  // 그쪽 검증은 unbuilt-routes.test.tsx에 있다. 여기 남은 목록은 목업이 있어 아직 진입점을
  // 빼 둔 화면들이다.
  it('[AC-SELLER-GATE-003] 목업만 있는 화면은 SideNav 진입점이 없다', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '스토어 설정' })).toBeInTheDocument()
    for (const label of ['대시보드', '주문/배송 관리', '취소/반품/교환', '배송 정책', '정산/매출']) {
      // **접두 정규식으로 묻는다.** SideNav 배지가 버튼 안에 들어가 접근성 이름이
      // "<항목> 준비 중"이 되므로, 정확 이름(`name: label`)으로 물으면 항목이 nav에 배지와 함께
      // 올라와 있어도 못 찾고 부재 단언이 그냥 통과한다 — 이 단언의 전제가 깨져도 빨개지지
      // 않는다는 뜻이다(실측 확인). 접두로 물어야 복원 시 실제로 실패해 이 목록을 갱신하게 된다.
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}`) })).not.toBeInTheDocument()
    }
  })
})

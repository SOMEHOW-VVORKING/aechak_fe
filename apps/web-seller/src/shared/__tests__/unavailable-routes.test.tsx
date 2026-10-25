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

// seller 모듈에 API가 없는 화면(대시보드/주문/클레임/정산)은 목업만 있어 운영 진입을 막는다 —
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

  it('[AC-SELLER-GATE-003] SideNav에는 서버가 있는 화면만 남는다(상품 관리·배송 정책·스토어 설정)', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배송 정책' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '스토어 설정' })).toBeInTheDocument()
    for (const label of [
      '대시보드',
      '주문/배송 관리',
      '취소/반품/교환',
      '정산/매출',
      '고객 문의',
      '혜택/쿠폰/할인',
    ]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

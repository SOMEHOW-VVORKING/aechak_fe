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

// seller 모듈에 API가 없는 화면(대시보드)은 목업만 있어 운영 진입을 막는다 —
// nav에서 빠지고, 주소로 직접 들어와도 "준비 중" 안내만 보여주며 목업 데이터·저장 버튼을 그리지 않는다.
// 주문/배송 관리(SCRUM-291)·취소/반품/교환(SCRUM-295)·배송 정책·정산/매출(SCRUM-293)은 서버가
// 올라와 이 목록에서 빠졌다 — 실연동 검증은 features/*/__tests__/*-route.test.tsx가 맡는다.
describe('목업 화면 진입 차단', () => {
  it('[AC-SELLER-GATE-001] 대시보드(/)는 준비 중 안내와 상품 관리 이동만 보여주고 목업 지표를 그리지 않는다', async () => {
    renderAt('/')

    expect(await screen.findByText('대시보드는 준비 중이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 관리로' })).toBeInTheDocument()
    expect(screen.queryByText(/최근 7일/)).not.toBeInTheDocument()
  })

  // [AC-SELLER-GATE-002] 주소 직접 진입 표는 비웠다 — 게이트가 남은 화면이 대시보드(`/`) 하나뿐이고
  // 위 AC-SELLER-GATE-001이 그 경로를 이미 덮는다(vitest는 빈 each 표를 거부한다).

  it('[AC-SELLER-GATE-003] SideNav에는 서버가 있는 화면(주문/배송 관리·상품 관리·취소/반품/교환·배송 정책·정산/매출·스토어 설정)만 남는다', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    // 주문/배송 관리(SCRUM-291)·취소/반품/교환(SCRUM-295)·배송 정책·정산/매출(SCRUM-293)은
    // 서버가 생겨 되돌린 항목이다.
    expect(screen.getByRole('button', { name: '주문/배송 관리' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소/반품/교환' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배송 정책' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정산/매출' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '스토어 설정' })).toBeInTheDocument()
    for (const label of ['대시보드', '고객 문의', '혜택/쿠폰/할인']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

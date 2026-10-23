import { render, screen } from '@testing-library/react'
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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// admin 모듈에 셀러 계정 조회·제재 API가 없다(입점 심사와 별개) — 목업 목록·판매정지는 운영 진입을 막는다.
describe('/sellers', () => {
  it('[AC-SELLER-MGMT-003] 직접 진입하면 준비 중 안내만 보여주고 목업 셀러 목록·판매정지를 그리지 않는다', async () => {
    renderAt('/sellers')

    expect(await screen.findByText('셀러 관리는 준비 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '냥이상점' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '판매정지' })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-MGMT-004] SideNav에는 API가 있는 화면만 남고 목업 화면·라우트 없는 항목·상수 배지가 없다', async () => {
    renderAt('/sellers')

    expect(await screen.findByRole('button', { name: '셀러 입점 심사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '홈' })).toBeInTheDocument()
    // AI 검수 큐는 admin 모듈에 EP 4종(/admin/content-inspections)이 생겨 nav로 올라왔다 —
    // 이 항목이 금지 목록에 있던 것은 화면이 목업 배열로 돌던 시절의 사실이다.
    expect(screen.getByRole('button', { name: 'AI 검수 큐' })).toBeInTheDocument()
    // 아직 목업뿐인 화면과 라우트 없던 항목(상수 배지가 붙어 있던 것 포함)은 nav에서 빠진다.
    for (const label of ['셀러 관리', '일반 회원 관리', '상품 검수 관리', '신고 제재 관리', '정산 관리']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

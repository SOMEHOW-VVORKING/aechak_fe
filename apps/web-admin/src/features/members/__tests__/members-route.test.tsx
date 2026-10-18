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

// admin 모듈에 회원 조회·제재 API가 없다 — 목업 목록·제재 모달은 운영 진입을 막고 안내만 보여준다.
describe('/members', () => {
  it('[AC-MEMBER-002] 직접 진입하면 준비 중 안내만 보여주고 목업 회원 목록을 그리지 않는다', async () => {
    renderAt('/members')

    expect(await screen.findByText('일반 회원 관리는 준비 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'user_11550' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
  })
})

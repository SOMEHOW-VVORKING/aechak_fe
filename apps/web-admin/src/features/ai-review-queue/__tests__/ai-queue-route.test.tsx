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

// admin 모듈에 AI 검수 큐 API가 없다 — 목업 큐·승인/반려/삭제 모달은 운영 진입을 막고 안내만 보여준다.
describe('/products/ai-queue', () => {
  it('[AC-AI-QUEUE-003] 직접 진입하면 준비 중 안내만 보여주고 목업 큐 목록을 그리지 않는다', async () => {
    renderAt('/products/ai-queue')

    expect(await screen.findByText('AI 검수 큐는 준비 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
  })
})

import { render, screen, within } from '@testing-library/react'
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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// admin 모듈에 AI 검수 큐 API가 없다. 2026-10-18에는 진입을 막았는데 운영자가 기능의 모양조차
// 볼 수 없어 되돌렸다(SCRUM-308) — 예시 데이터로 열고 띠로 밝힌다.
describe('/products/ai-queue', () => {
  it('[AC-AI-QUEUE-003] 직접 진입하면 예시 큐 목록과 탐지 사유가 보인다', async () => {
    renderAt('/products/ai-queue')

    expect(await screen.findByRole('button', { name: 'A-2931' })).toBeInTheDocument()
    // 탐지 사유가 빠지면 운영자가 왜 숨겨졌는지 알 수 없다.
    // 필터 Select의 <option>에 같은 글자가 있어 전역에서 찾으면 목록이 비어도 통과한다.
    expect(within(screen.getByRole('table')).getByText('금지 콘텐츠')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-004] 행을 누르면 상세 드로어가 열리고 결정 옵션이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: 'A-2931' }))

    expect(await screen.findByRole('dialog', { name: 'AI 검수 상세' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument()
  })
})

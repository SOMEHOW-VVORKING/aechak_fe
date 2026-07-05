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
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// AC-AI-QUEUE-001: AI 탐지 근거는 검수 상세 드로어에 노출된다
describe('/products/ai-queue', () => {
  it('[AC-AI-QUEUE-001] shows the AI detection reasoning in the detail drawer', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: 'A-2931' }))

    expect(await screen.findByText(/신뢰도 0.92/)).toBeInTheDocument()
  })

  // AC-AI-QUEUE-002: 관리자 삭제를 선택하고 제출 후 확인 모달에서 확정하면 콘텐츠 삭제 처리를 통보하는 토스트가 뜬다
  it('[AC-AI-QUEUE-002] deletes the content after confirming the modal', async () => {
    const user = userEvent.setup()
    renderAt('/products/ai-queue')

    await user.click(await screen.findByRole('button', { name: 'A-2931' }))
    await user.click(screen.getByText('관리자 삭제', { selector: 'p' }))
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '콘텐츠를 강제 삭제할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText('콘텐츠를 삭제했어요.')).toBeInTheDocument()
  })
})

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

// AC-MEMBER-001: 영구 정지를 선택하고 제출을 클릭하면 확인 모달이 뜬다
describe('/members', () => {
  it('[AC-MEMBER-001] requires confirming the modal before permanently banning a member', async () => {
    const user = userEvent.setup()
    renderAt('/members')

    await user.click(await screen.findByRole('button', { name: 'user_11550' }))
    await user.click(screen.getByText('영구 정지', { selector: 'p' }))
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '계정을 영구 정지할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '영구 정지' }))

    expect(await screen.findByText("'길냥이지킴' 계정을 영구 정지했어요.")).toBeInTheDocument()
  })
})

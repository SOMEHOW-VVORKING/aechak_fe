import { render, screen } from '@testing-library/react'
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

// AC-ONBOARD-003: 필수 약관에 동의하지 않으면 다음 단계로 진행할 수 없다
describe('/onboarding/terms', () => {
  it('[AC-ONBOARD-003] shows an error and blocks navigation when required terms are unchecked', async () => {
    const user = userEvent.setup()
    renderAt('/onboarding/terms')

    await user.click(await screen.findByRole('button', { name: '다음' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '필수 약관에 동의해야 가입할 수 있어요',
    )
  })

  it('[AC-ONBOARD-003] enables navigation once all required terms are checked via 전체 동의', async () => {
    const user = userEvent.setup()
    renderAt('/onboarding/terms')

    await user.click(await screen.findByRole('button', { name: '전체 동의' }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByRole('heading', { name: '닉네임을 정해 주세요' })).toBeInTheDocument()
  })
})

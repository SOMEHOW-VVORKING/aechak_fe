import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetAuth } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'

function renderLoginRoute() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/onboarding/login'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('/onboarding/login — 로그인 수단', () => {
  beforeEach(() => resetAuth())

  it('[AC-ONBOARD-015] 로그인 버튼은 카카오 하나다', async () => {
    renderLoginRoute()

    expect(await screen.findByRole('button', { name: '카카오로 시작하기' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /구글/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apple/ })).not.toBeInTheDocument()
  })
})

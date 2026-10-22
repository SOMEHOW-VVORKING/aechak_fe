import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { seedAccount } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 이 파일은 SNS BE가 배포된 뒤(진입점이 열린 상태)를 확인한다. 닫힌 상태는 mypage-hub-route.test.tsx가 본다.
vi.mock('@/shared/sns-availability', () => ({ SNS_SERVER_AVAILABLE: true }))

const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent

describe('/mypage SNS 진입 행', () => {
  beforeEach(() => {
    seedAccount({ nickname: '보리언니' })
    setAccessToken('test-token')
  })

  it('[AC-SNS01-006] 내 SNS 프로필 행으로 들어가면 게시물과 팔로우가 없어도 세 수 0과 저장됨 탭이 보인다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/mypage')

    await user.click(await screen.findByRole('button', { name: '내 SNS 프로필' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))
    expect(await screen.findByRole('tab', { name: '저장됨' })).toBeInTheDocument()
    expect([stat('게시물'), stat('팔로워'), stat('팔로잉')]).toEqual(['0', '0', '0'])
    expect(screen.getByRole('button', { name: '프로필 수정' })).toBeInTheDocument()
  })

  it('[AC-SNS01-007] 마이 메뉴의 기존 프로필 행은 프로필 수정을 연다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/mypage')

    await user.click(await screen.findByText('보리언니'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mypage/profile'))
  })

  it('[AC-SNS01-022] 차단/뮤트 관리 행은 관리 화면을 연다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/mypage')

    await user.click(await screen.findByRole('button', { name: '차단/뮤트 관리' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mypage/sns-relations'))
  })
})

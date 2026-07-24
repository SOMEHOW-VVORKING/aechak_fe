import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { getAccount, resetAccount } from '@/shared/account'
import { routeTree } from '../../../routeTree.gen'

function makeRouter(path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
}

function renderNicknameRoute() {
  const router = makeRouter('/onboarding/nickname')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 사용 가능한 닉네임(TAKEN 목록 밖) 입력 → 디바운스(400ms) + 중복확인 목업(500ms) 후 '애착 시작하기'가 활성.
async function fillNicknameAndSubmit(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(await screen.findByLabelText(/닉네임/), value)
  const submit = screen.getByRole('button', { name: '애착 시작하기' })
  await waitFor(() => expect(submit).toBeEnabled(), { timeout: 3000 })
  await user.click(submit)
}

describe('/onboarding/nickname 완료', () => {
  beforeEach(() => {
    resetAccount()
  })

  it('[AC-ONBOARD-004] 닉네임 확정 시 완료 화면이 뜨고, 버튼으로 홈에 들어간다(자동 이동/낡은 안내 없음)', async () => {
    const user = userEvent.setup()
    const router = renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')

    // 완료 화면 — 매듭(가입 완료 + 환영) + 홈 버튼. 아직 홈으로 자동 이동하지 않는다.
    expect(await screen.findByRole('heading', { name: '가입 완료!' })).toBeInTheDocument()
    expect(screen.getByText(/초코집사님, 애착에 오신 걸 환영해요/)).toBeInTheDocument()
    expect(screen.queryByText(/다음 배치에서 만나요/)).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding/nickname')

    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('[AC-ONBOARD-005] 완료 시 입력한 닉네임이 계정에 저장된다', async () => {
    const user = userEvent.setup()
    renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')
    await screen.findByRole('heading', { name: '가입 완료!' })

    expect(getAccount().nickname).toBe('초코집사')
  })
})

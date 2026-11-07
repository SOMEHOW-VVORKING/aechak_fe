import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'
import { API_ORIGIN, seedAdminRoster, server } from '@/testing/msw/server'

// 아이디·비밀번호 로그인(SCRUM-373) — 카카오를 대체하지 않고 더한 두 번째 진입 채널.
// 카카오와 달리 페이지 이동이 아니라 한 번의 POST이고, access를 응답 body로 바로 받는다.
const PASSWORD_LOGIN_URL = `${API_ORIGIN}/api/v1/auth/login/password`

function renderLogin() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function submitLogin(loginId: string, password: string) {
  await userEvent.type(await screen.findByLabelText('아이디'), loginId)
  await userEvent.type(screen.getByLabelText('비밀번호'), password)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

describe('어드민 아이디·비밀번호 로그인 (SCRUM-373)', () => {
  beforeEach(() => {
    seedAdminRoster()
    setAccessToken(null)
  })

  it('[AC-ADMIN-PWLOGIN-001] 아이디와 비밀번호를 넣어 제출하면 access를 받아 운영 화면으로 간다', async () => {
    const received: unknown[] = []
    server.use(
      http.post(PASSWORD_LOGIN_URL, async ({ request }) => {
        received.push(await request.json())
        return HttpResponse.json({ data: { accessToken: 'admin-access', tokenType: 'Bearer', expiresIn: 1800 } })
      }),
    )

    const router = renderLogin()
    await submitLogin('admin1', 'aechak-judge-4x7m-2026')

    // 토큰을 받았는지와 화면을 옮겼는지를 함께 본다 — 주소만 보면 아직 요청이 끝나지 않은 상태로도 통과한다.
    await waitFor(() => expect(getAccessToken()).toBe('admin-access'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(received).toEqual([{ loginId: 'admin1', password: 'aechak-judge-4x7m-2026' }])
  })

  it('[AC-ADMIN-PWLOGIN-002] 거절되면 안내를 보여주고 화면을 옮기지 않으며 토큰도 남기지 않는다', async () => {
    server.use(
      http.post(PASSWORD_LOGIN_URL, () =>
        HttpResponse.json({ errorCode: 20014, message: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 }),
      ),
    )

    const router = renderLogin()
    await submitLogin('admin1', 'wrong-password')

    expect(await screen.findByText('아이디 또는 비밀번호가 올바르지 않아요.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(getAccessToken()).toBeNull()
  })

  it('[AC-ADMIN-PWLOGIN-003] 아이디나 비밀번호가 비어 있으면 제출 버튼이 잠긴다', async () => {
    renderLogin()

    const submit = await screen.findByRole('button', { name: '로그인' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('아이디'), 'admin1')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('비밀번호'), 'x')
    expect(submit).toBeEnabled()
  })

  it('[AC-ADMIN-PWLOGIN-004] 카카오 로그인이 그대로 남아 있다', async () => {
    renderLogin()

    // 비밀번호 채널은 카카오를 대체하지 않는다. 사장님과 팀원은 카카오로 들어온다.
    expect(await screen.findByRole('button', { name: '카카오로 로그인' })).toBeEnabled()
  })
})

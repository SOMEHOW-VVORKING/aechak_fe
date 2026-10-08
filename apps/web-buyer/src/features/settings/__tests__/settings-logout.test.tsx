import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken, getAccessToken } from '@aechak/api'
import { getIsLoggedIn, resetAuth } from '@/shared/auth'
import { WEB_LOGOUT_URL, server } from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}

async function confirmLogout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '로그아웃' }))
  // Modal이 열리면 같은 이름의 버튼이 둘(행 버튼 + 확인 버튼) — 마지막이 Modal 확인.
  const confirmButtons = await screen.findAllByRole('button', { name: '로그아웃' })
  await user.click(confirmButtons[confirmButtons.length - 1]!)
}

describe('/settings 로그아웃 — 서버 세션 종료 배선', () => {
  beforeEach(() => resetAuth())
  afterEach(() => setAccessToken(null))

  it('[AC-LOGOUT-003] 확인 시 서버 로그아웃 → 토큰 파기 → 로컬 로그아웃 + 홈 가드가 로그인으로 보냄', async () => {
    let called = 0
    server.use(
      http.post(WEB_LOGOUT_URL, () => {
        called += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setAccessToken('live-token')
    const user = userEvent.setup()
    renderAt('/settings')

    await confirmLogout(user)

    // 홈으로 이동하면 홈 가드가 로그아웃 상태를 보고 /home 없이 로그인 화면으로 보낸다.
    // 서버 호출·토큰 파기·로컬 플래그까지 전부 반영.
    expect(await screen.findByRole('button', { name: '카카오로 시작하기' })).toBeInTheDocument()
    expect(called).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(getIsLoggedIn()).toBe(false)
  })

  it('[AC-LOGOUT-004] 취소하면 아무것도 하지 않는다(서버 미호출·로그인 유지)', async () => {
    let called = 0
    server.use(
      http.post(WEB_LOGOUT_URL, () => {
        called += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/settings')

    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    await user.click(await screen.findByRole('button', { name: '취소' }))

    expect(called).toBe(0)
    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-LOGOUT-005] 응답 전에 화면을 떠나도 로그아웃이 끝나면 로컬 정리를 한다', async () => {
    // 정리가 호출부 mutate 콜백에 있으면 언마운트 시 콜백이 버려져 로그인 플래그·캐시가 남는다(탈퇴와 동일 회귀).
    let respond!: () => void
    const responded = new Promise<void>(resolve => {
      respond = resolve
    })
    let called = 0
    server.use(
      http.post(WEB_LOGOUT_URL, async () => {
        called += 1
        await responded
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setAccessToken('live-token')
    const user = userEvent.setup()
    const { queryClient, router } = renderAt('/settings')

    await confirmLogout(user)
    await waitFor(() => expect(called).toBe(1))
    // 응답 대기 중에 ← 등으로 화면을 떠난다(SettingsHomeScreen 언마운트).
    await act(() => router.navigate({ to: '/settings/privacy' }))
    expect(screen.queryByText('로그아웃 할까요?')).not.toBeInTheDocument()
    expect(getIsLoggedIn()).toBe(true)

    respond()

    await waitFor(() => expect(getIsLoggedIn()).toBe(false))
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })
})

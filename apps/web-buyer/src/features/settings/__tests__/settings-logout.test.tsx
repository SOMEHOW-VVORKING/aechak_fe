import { render, screen } from '@testing-library/react'
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
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/settings 로그아웃 — 서버 세션 종료 배선', () => {
  beforeEach(() => resetAuth())
  afterEach(() => setAccessToken(null))

  it('[AC-LOGOUT-003] 확인 시 서버 로그아웃 → 토큰 파기 → 홈 이동 + 로컬 로그아웃', async () => {
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

    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    // Modal이 열리면 같은 이름의 버튼이 둘(행 버튼 + 확인 버튼) — 마지막이 Modal 확인.
    const confirmButtons = await screen.findAllByRole('button', { name: '로그아웃' })
    await user.click(confirmButtons[confirmButtons.length - 1]!)

    // 홈으로 이동했고(설정 화면이 아님), 서버 호출·토큰 파기·로컬 플래그까지 전부 반영.
    expect(await screen.findByText(/지금 인기 있는 상품/)).toBeInTheDocument()
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
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'
import { ADMIN_ROSTER_URL, API_ORIGIN, WEB_REFRESH_URL, seedAdminRoster, server } from '@/testing/msw/server'

// 어드민 실로그인 — 카카오 웹 로그인(서버 콜백) + /auth/web/refresh 부트스트랩. 어드민 모듈에는
// `/auth/*`가 아예 없어서 로그인·refresh는 늘 api 호스트(8080)로 나가야 한다. MSW의 refresh
// 핸들러 base가 apiBase인 것 자체가 그 회귀 감시다.
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
  return router
}

/** 로그인 진입은 API 호출이 아니라 페이지 이동이다 — jsdom은 실제 이동을 구현하지 않아 가로챈다. */
function stubLocationHref() {
  const assigned: string[] = []
  const original = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...original,
      origin: 'http://localhost:5174',
      get href() {
        return assigned.at(-1) ?? ''
      },
      set href(value: string) {
        assigned.push(value)
      },
    },
  })
  return {
    assigned,
    restore: () => Object.defineProperty(window, 'location', { configurable: true, value: original }),
  }
}

describe('어드민 로그인 (SCRUM-252)', () => {
  beforeEach(() => {
    seedAdminRoster()
    setAccessToken(null)
  })
  afterEach(() => {
    setAccessToken(null)
    vi.restoreAllMocks()
  })

  it('[AC-ADM-AUTH-001] 로그인 화면은 카카오만 활성이고 이메일/비밀번호 폼이 없다', async () => {
    renderAt('/login')

    expect(await screen.findByRole('button', { name: '카카오로 로그인' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /구글/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apple/ })).not.toBeInTheDocument()
    // BE에 POST /auth/login이 없다 — 이메일/비밀번호 폼은 제거됐다.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('[AC-ADM-AUTH-002] 로그인 화면에는 SideNav가 없고 업무 API를 부르지 않는다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => requested.push(request.url))
    renderAt('/login')

    await screen.findByRole('button', { name: '카카오로 로그인' })

    // 셸이 심사 대기 수를 부르는 훅을 쥐고 있어, 분기를 훅 아래로 내리면 로그인 전에 401/403을 만든다.
    expect(screen.queryByRole('button', { name: '관리자 관리' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '셀러 입점 심사' })).not.toBeInTheDocument()
    expect(requested.filter(url => url.includes('/admin/'))).toEqual([])
  })

  it('[AC-ADM-AUTH-003] 카카오 클릭은 api 호스트의 서버 로그인 리다이렉트로 이동한다', async () => {
    const user = userEvent.setup()
    const location = stubLocationHref()
    try {
      renderAt('/login')
      await user.click(await screen.findByRole('button', { name: '카카오로 로그인' }))

      // 어드민 호스트(8082)에는 /auth/*가 없다 — 기본 호스트가 아니라 api 호스트를 명시한다.
      expect(location.assigned).toHaveLength(1)
      expect(location.assigned[0]).toBe(
        `${API_ORIGIN}/api/v1/auth/login/kakao/redirect?return=${encodeURIComponent(
          'http://localhost:5174/login/complete',
        )}`,
      )
    } finally {
      location.restore()
    }
  })

  it('[AC-ADM-AUTH-004] /login/complete는 refresh로 access를 받고 홈으로 보낸다', async () => {
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'admin-access', tokenType: 'Bearer', expiresIn: 1800 } }),
      ),
    )
    const router = renderAt('/login/complete?status=ACTIVE&isNew=false')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    // access는 쿼리로 오지 않는다 — 복귀 라우트의 refresh가 유일한 수령 경로다.
    expect(getAccessToken()).toBe('admin-access')
  })

  it('[AC-ADM-AUTH-005] refresh가 실패하면 로그인으로 되돌리고 사유를 보여준다', async () => {
    // MSW 기본 refresh 핸들러는 401이다(성공으로 새면 실패 경로가 조용히 통과한다).
    const router = renderAt('/login/complete?status=ACTIVE')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(await screen.findByText('로그인에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
  })

  it('[AC-ADM-AUTH-006] 온보딩 미완 계정은 어드민 온보딩으로 보내지 않고 관리자 계정 재로그인을 안내한다', async () => {
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'pending-access', tokenType: 'Bearer', expiresIn: 1800 } }),
      ),
    )
    const router = renderAt('/login/complete?status=PENDING_ONBOARDING')

    // 어드민에는 온보딩 화면도 개념도 없다 — 셀러센터의 "구매자 앱 온보딩" 문구를 복사하지 않는다.
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(
      await screen.findByText('온보딩이 끝나지 않은 계정이에요. 관리자 계정으로 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
  })

  it('[AC-ADM-AUTH-007] 서버가 ?error=로 되돌려보내면 refresh를 부르지 않고 그 사유를 띄운다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => requested.push(request.url))
    const router = renderAt('/login/complete?error=20005')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(await screen.findByText('이용이 제한된 계정이에요. 다른 관리자에게 문의해 주세요.')).toBeInTheDocument()
    expect(requested.filter(url => url.includes('/auth/web/refresh'))).toEqual([])
  })

  it('[AC-ADM-AUTH-008] 업무 조회의 401이 refresh까지 실패하면 로그인으로 튕긴다', async () => {
    // main.tsx가 setOnAuthExpired를 등록하지 않으면 이 경로가 무동작이 되어, 운영자는 명부가 비어
    // 보이기만 하고 왜 안 되는지 알 수 없다. 전역 핸들러 등록 자체를 고정한다.
    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
      ),
    )
    const { setupAuthExpiredRedirect } = await import('../auth.session')
    const router = renderAt('/admins')
    setupAuthExpiredRedirect(router)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})

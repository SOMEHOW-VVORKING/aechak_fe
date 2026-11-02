import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { WEB_LOGOUT_URL, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 셀러센터 로그아웃(SCRUM-353). 세 웹앱이 api 호스트의 refresh 쿠키 하나를 공유하는데 진입점이
// 구매자 설정 홈에만 있어 데모 중 계정 전환이 불가능했다.
//
// MSW 핸들러를 **apiBase에만** 등록하는 것 자체가 호스트 회귀 감시다 — 요청이 seller 호스트
// (8081)로 나가면 test-setup의 `onUnhandledRequest: 'error'`가 그 요청을 실패시켜 로그아웃이
// 끝나지 않고, 아래 "로그인 화면에 도달한다" 단언이 깨진다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

/** nav 행 버튼과 Modal 확인 버튼이 이름이 같다 — 마지막이 Modal 확인(web-buyer 관례). */
async function confirmLogout(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '로그아웃' }))
  const buttons = await screen.findAllByRole('button', { name: '로그아웃' })
  await user.click(buttons[buttons.length - 1]!)
}

/** 로그아웃 호출을 세는 핸들러. 기본 핸들러가 없으므로 테스트마다 명시적으로 등록한다. */
function stubLogout(status: number) {
  const calls: { url: string }[] = []
  server.use(
    http.post(WEB_LOGOUT_URL, ({ request }) => {
      calls.push({ url: request.url })
      return status === 204
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status })
    }),
  )
  return calls
}

/**
 * 실패 안내는 **Modal 안에서만** 찾는다. 화면의 공용 `Alert` 띠도 `role="alert"`이라 전역
 * `getByRole('alert')`는 둘을 가르지 못한다(AGENTS.md 4절 함정).
 */
function logoutDialog() {
  return within(screen.getByRole('dialog'))
}

describe('셀러센터 로그아웃 (SCRUM-353)', () => {
  it('[AC-SELLER-LOGOUT-001] 확인 문구가 쿠키 공유와 "다른 앱은 새로 고치면 다시 로그인"을 밝힌다', async () => {
    const user = userEvent.setup()
    renderAt('/products')

    await user.click(await screen.findByRole('button', { name: '로그아웃' }))

    // 쿠키를 세 앱이 공유한다는 사실을 운영자가 확인 전에 읽어야 한다 — 없으면 옆 탭의 구매자
    // 앱이 끊긴 것을 장애로 읽는다. "지금 끊긴다"가 아니라 "새로 고치면"까지만 약속해야 맞다
    // (다른 탭의 메모리 토큰·로그인 플래그는 이 앱이 건드릴 수 없다).
    expect(await screen.findByText(/로그인 쿠키 하나를 함께/)).toBeInTheDocument()
    expect(screen.getByText(/구매자 앱과 어드민도 새로 고치면 다시 로그인/)).toBeInTheDocument()
  })

  it('[AC-SELLER-LOGOUT-002] 확인하면 api 호스트로 로그아웃 1회 → 토큰 파기 → 로그인 화면', async () => {
    const calls = stubLogout(204)
    setAccessToken('seller-live-token')
    const user = userEvent.setup()
    const { router, queryClient } = renderAt('/products')

    await confirmLogout(user)

    expect(await screen.findByRole('button', { name: '카카오로 로그인' })).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    // 경로까지 고정한다 — 호스트 분기가 seller(8081)로 보냈다면 이 핸들러에 닿지 못한다.
    expect(calls[0]!.url).toBe('http://localhost:8080/api/v1/auth/web/logout')
    expect(getAccessToken()).toBeNull()
    expect(router.state.location.pathname).toBe('/login')
    // 다음 운영자가 이전 계정의 목록을 보지 않는다.
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0))
  })

  it('[AC-SELLER-LOGOUT-003] 취소하면 서버를 부르지 않고 세션도 화면도 그대로다', async () => {
    const calls = stubLogout(204)
    setAccessToken('seller-live-token')
    const user = userEvent.setup()
    const { router } = renderAt('/products')

    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    await user.click(await screen.findByRole('button', { name: '취소' }))

    expect(calls).toHaveLength(0)
    expect(getAccessToken()).toBe('seller-live-token')
    expect(router.state.location.pathname).toBe('/products')
    expect(screen.queryByText('로그아웃할까요?')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-LOGOUT-004] 전송이 실패하면 "확인하지 못했다"를 밝히고 세션을 건드리지 않는다', async () => {
    const calls = stubLogout(500)
    setAccessToken('seller-live-token')
    const user = userEvent.setup()
    const { router } = renderAt('/products')

    await confirmLogout(user)

    const alert = await logoutDialog().findByRole('alert')
    expect(alert).toHaveTextContent('로그아웃을 확인하지 못했어요')
    expect(alert).toHaveTextContent('이 화면은 아직 로그인 상태예요')
    expect(calls).toHaveLength(1)
    // 실패에서 토큰을 비우면 쿠키가 살아 있는 채로 가드가 세션을 복원해 "로그아웃한 것 같은데
    // 같은 계정"이 된다 — 그 상태를 만들지 않는 것이 이 단언이다.
    expect(getAccessToken()).toBe('seller-live-token')
    expect(router.state.location.pathname).toBe('/products')
  })

  it('[AC-SELLER-LOGOUT-005] 실패 뒤 닫고 다시 열면 지난 실패 안내가 남지 않는다', async () => {
    stubLogout(500)
    const user = userEvent.setup()
    renderAt('/products')

    await confirmLogout(user)
    expect(await logoutDialog().findByRole('alert')).toHaveTextContent('로그아웃을 확인하지 못했어요')

    await user.click(screen.getByRole('button', { name: '취소' }))
    await user.click(await screen.findByRole('button', { name: '로그아웃' }))

    expect(await screen.findByText('로그아웃할까요?')).toBeInTheDocument()
    expect(logoutDialog().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-LOGOUT-006] 전송 중에는 Modal이 닫히지 않아 실패 안내가 사라지지 않는다', async () => {
    // 응답을 테스트가 붙잡고 있는 핸들러 — "전송 중"을 실제로 만들어야 이 회귀가 드러난다.
    let release: (() => void) | undefined
    const inflight = new Promise<void>(resolve => {
      release = resolve
    })
    const calls: string[] = []
    server.use(
      http.post(WEB_LOGOUT_URL, async ({ request }) => {
        calls.push(request.url)
        await inflight
        return HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 })
      }),
    )
    setAccessToken('seller-live-token')
    const user = userEvent.setup()
    renderAt('/products')

    await confirmLogout(user)

    // 취소·Escape·스크림이 전송 중에 닫아 버리면 `logout.reset()`이 진행 중 mutation에서
    // 옵저버를 떼어(query-core mutationObserver.reset) 아래 실패 안내가 뜰 자리가 사라진다.
    await user.click(screen.getByRole('button', { name: '취소' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    release?.()

    expect(await logoutDialog().findByRole('alert')).toHaveTextContent('로그아웃을 확인하지 못했어요')
    // 닫고 다시 열 수 있었다면 확인 버튼이 되살아나 두 번째 요청이 나간다.
    expect(calls).toHaveLength(1)
    expect(getAccessToken()).toBe('seller-live-token')
  })
})

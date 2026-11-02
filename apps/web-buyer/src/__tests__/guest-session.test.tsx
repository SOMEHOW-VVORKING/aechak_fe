import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken } from '@aechak/api'
import { getSessionState, resetAuth } from '@/shared/auth'
import { CART_URL, CATEGORIES_URL, WEB_REFRESH_URL, server } from '@/testing/msw/server'
import { routeTree } from '../routeTree.gen'

// __root beforeLoad의 세션 한 번 확인(restoreSessionOrGuest)을 라우터째로 검증한다.
// access 토큰은 메모리에만 있어 새로고침·공유 링크 진입에서는 비어 있고 refresh 쿠키는 httpOnly라
// JS가 읽을 수 없다 — 그래서 "refresh를 한 번 쏴 본다"가 회원 여부를 아는 유일한 방법이다.

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

describe('첫 진입 세션 확인', () => {
  // 토큰 없음 + 확인 전(unknown) = 새로고침이나 공유 링크로 막 들어온 상태.
  beforeEach(() => resetAuth())

  it('[AC-GUEST-001] 쿠키가 없는 비회원도 마켓에서 상품을 본다(로그인으로 튕기지 않는다)', async () => {
    // 기본 refresh 핸들러가 401이라 비회원으로 확정된다. GET /products는 BE가 permitAll로
    // 열어 둔 게스트 카탈로그라 그대로 떠야 한다.
    const router = renderAt('/market')

    expect(await screen.findByText('강아지 연어 사료 2kg')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/market')
    expect(getSessionState()).toBe('guest')
  })

  it('[AC-GUEST-002] refresh 쿠키가 살아 있으면 마켓에서도 회원으로 복원돼 카테고리가 뜬다', async () => {
    // 비회원 기본값으로 굳어 있으면 회원이 새로고침해도 카테고리(인증 필요)가 사라진다 —
    // 거짓 상태를 읽게 되는 자리다.
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    renderAt('/market')

    expect(await screen.findByRole('button', { name: '강아지' })).toBeInTheDocument()
    expect(getAccessToken()).toBe('restored')
    expect(getSessionState()).toBe('member')
  })

  it('[AC-GUEST-003] 확인은 앱 수명에 한 번이다 — 화면을 옮겨도 refresh를 다시 쏘지 않는다', async () => {
    // refresh 쿠키는 호출마다 회전하므로 네비게이션마다 다시 쏘면 멀쩡한 세션이 흔들린다.
    let refreshCalls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        refreshCalls += 1
        return HttpResponse.json({ errorCode: 20002, message: '유효하지 않은 토큰' }, { status: 401 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/market')
    await screen.findByText('강아지 연어 사료 2kg')
    await waitFor(() => expect(refreshCalls).toBe(1))

    await user.click(screen.getByRole('button', { name: '검색' }))

    expect(await screen.findByText('최근 검색어')).toBeInTheDocument()
    expect(refreshCalls).toBe(1)
  })

  it('[AC-GUEST-004] 비회원이면 마켓에서 회원 전용 조회(카테고리, 장바구니 배지)가 아예 나가지 않는다', async () => {
    // 한 건이라도 나가면 401 → refresh 실패 → 전역 onAuthExpired로 마켓을 잃는다.
    let categoryCalls = 0
    let cartCalls = 0
    server.use(
      http.get(CATEGORIES_URL, () => {
        categoryCalls += 1
        return HttpResponse.json({ data: [] })
      }),
      http.get(CART_URL, () => {
        cartCalls += 1
        return HttpResponse.json({ data: { items: [] } })
      }),
    )
    renderAt('/market')

    await screen.findByText('강아지 연어 사료 2kg')
    await waitFor(() => expect(getSessionState()).toBe('guest'))
    expect(categoryCalls).toBe(0)
    expect(cartCalls).toBe(0)
  })

  it('[AC-GUEST-005] 확인이 5xx로 실패하면 비회원으로 못 박지 않고 다음 화면에서 다시 확인한다', async () => {
    // 일시 장애 한 번으로 비회원이 되면, refresh 쿠키가 멀쩡한 회원에게 회원 전용 화면이
    // "로그인이 필요해요"라고 거짓을 말하고 서버가 복구돼도 그대로 남는다.
    let calls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 })
          : HttpResponse.json({
              data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 900 },
            })
      }),
    )
    const user = userEvent.setup()
    renderAt('/market')
    await screen.findByText('강아지 연어 사료 2kg')
    await waitFor(() => expect(getSessionState()).toBe('unknown'))

    await user.click(screen.getByRole('button', { name: '검색' }))

    await screen.findByText('최근 검색어')
    await waitFor(() => expect(getSessionState()).toBe('member'))
    expect(calls).toBe(2)
  })

  it('[AC-GUEST-006] 꼬리 슬래시가 붙은 /login/complete/ 도 세션 확인을 중복하지 않는다', async () => {
    // 그 라우트가 직접 refresh로 세션을 수령하므로 루트의 확인은 건너뛰어야 한다 — 문자열을
    // 그대로 비교하면 꼬리 슬래시에서 예외가 빗나가 쿠키를 연달아 한 번 더 회전시킨다.
    // 2회는 그 라우트 자체의 기존 동작이고(루트 확인이 없어도 2회), 3회면 루트가 끼어든 것이다.
    let refreshCalls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        refreshCalls += 1
        return HttpResponse.json({
          data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 900 },
        })
      }),
    )
    const router = renderAt('/login/complete/?status=ACTIVE')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(refreshCalls).toBe(2)
  })
})

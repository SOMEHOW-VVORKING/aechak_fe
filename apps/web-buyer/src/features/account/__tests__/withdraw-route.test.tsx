import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { getIsLoggedIn, resetAuth } from '@/shared/auth'
import { USER_ME_URL, WITHDRAWAL_CHECK_URL, server } from '../../../testing/msw/server'
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

// 요청 횟수를 세는 핸들러 — 확인 전에는 DELETE가 나가지 않는지, 정리 뒤 check를 다시 부르지 않는지 본다.
function countRequests() {
  const counts = { check: 0, withdraw: 0 }
  server.events.on('request:start', ({ request }) => {
    if (request.url.endsWith('/users/me/withdrawal/check')) counts.check += 1
    if (request.method === 'DELETE' && request.url.endsWith('/users/me')) counts.withdraw += 1
  })
  return counts
}

const REJOIN_NOTICE = '탈퇴 후 30일 동안은 같은 소셜 계정으로 다시 가입할 수 없어요.'

function errorBody(errorCode: number, message: string, status: number) {
  return HttpResponse.json({ errorCode, message }, { status })
}

async function confirmWithdraw(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '탈퇴하기' }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: '탈퇴하기' }))
}

describe('/mypage/withdraw (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    setAccessToken('test-access-token')
  })
  afterEach(() => {
    server.events.removeAllListeners()
    setAccessToken(null)
    resetAuth()
  })

  it('[AC-WITHDRAW-001] 탈퇴 가능하면 안내를 보여주고 확인 Modal 전에는 DELETE를 보내지 않는다', async () => {
    const counts = countRequests()
    const user = userEvent.setup()
    renderAt('/mypage/withdraw')

    expect(await screen.findByText('탈퇴하기 전에 확인해 주세요')).toBeInTheDocument()
    // BE 재가입 제한(auth.rejoin.blocked-period=30d, 같은 소셜 계정 기준)을 안내와 확인 Modal 양쪽에 알린다.
    expect(screen.getByText(REJOIN_NOTICE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('정말 탈퇴하시겠어요?')
    expect(dialog).toHaveTextContent(REJOIN_NOTICE)
    expect(counts.withdraw).toBe(0)
  })

  it('[AC-WITHDRAW-009] 홈 버튼이 보이고 누르면 홈(\'/\')으로 간다', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/mypage/withdraw')

    await screen.findByText('탈퇴하기 전에 확인해 주세요')
    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('[AC-WITHDRAW-002] 서버가 withdrawable=false면 제한 안내를 보여주고 탈퇴 버튼을 잠근다', async () => {
    server.use(http.get(WITHDRAWAL_CHECK_URL, () => HttpResponse.json({ data: { withdrawable: false } })))
    renderAt('/mypage/withdraw')

    expect(await screen.findByText('지금은 탈퇴할 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '주문 내역 보기' })).toBeInTheDocument()
  })

  it('[AC-WITHDRAW-003] 확인하면 DELETE 후 로그아웃과 같은 정리를 하고 완료 화면을 보여준다', async () => {
    const counts = countRequests()
    const user = userEvent.setup()
    const { queryClient } = renderAt('/mypage/withdraw')

    await confirmWithdraw(user)

    expect(await screen.findByText('탈퇴가 완료됐어요')).toBeInTheDocument()
    expect(counts.withdraw).toBe(1)
    expect(getAccessToken()).toBeNull()
    expect(getIsLoggedIn()).toBe(false)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    // 정리 뒤 check를 토큰 없이 다시 부르지 않는다(401 → 로그인 이동으로 새지 않게).
    expect(counts.check).toBe(1)
    expect(screen.getByRole('button', { name: '홈으로' })).toBeInTheDocument()
  })

  it('[AC-WITHDRAW-008] DELETE 응답 전에 화면을 떠나도 탈퇴가 끝나면 로그아웃 정리를 한다', async () => {
    let respond!: () => void
    const responded = new Promise<void>(resolve => {
      respond = resolve
    })
    server.use(
      http.delete(USER_ME_URL, async () => {
        await responded
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const counts = countRequests()
    const user = userEvent.setup()
    const { queryClient, router } = renderAt('/mypage/withdraw')

    await confirmWithdraw(user)
    await waitFor(() => expect(counts.withdraw).toBe(1))
    // 응답 대기 중에 ← 등으로 화면을 떠난다(WithdrawScreen 언마운트).
    await act(() => router.navigate({ to: '/settings/privacy' }))
    expect(screen.queryByText('탈퇴하기 전에 확인해 주세요')).not.toBeInTheDocument()

    respond()

    await waitFor(() => expect(getIsLoggedIn()).toBe(false))
    expect(getAccessToken()).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('[AC-WITHDRAW-004] DELETE가 409/30011이면 판정을 다시 받아 제한 안내로 바꾼다', async () => {
    let withdrawable = true
    server.use(
      http.get(WITHDRAWAL_CHECK_URL, () => HttpResponse.json({ data: { withdrawable } })),
      http.delete(USER_ME_URL, () => {
        withdrawable = false
        return errorBody(30011, '정리되지 않은 거래가 있어 탈퇴할 수 없습니다.', 409)
      }),
    )
    const user = userEvent.setup()
    renderAt('/mypage/withdraw')

    await confirmWithdraw(user)

    expect(await screen.findByText('지금은 탈퇴할 수 없어요')).toBeInTheDocument()
    expect(getIsLoggedIn()).toBe(true)
    expect(getAccessToken()).toBe('test-access-token')
  })

  it('[AC-WITHDRAW-005] DELETE가 403/20005면 Modal 안에 해요체 안내를 보여주고 세션은 유지한다', async () => {
    server.use(http.delete(USER_ME_URL, () => errorBody(20005, '이용이 제한된 계정입니다.', 403)))
    const user = userEvent.setup()
    renderAt('/mypage/withdraw')

    await confirmWithdraw(user)

    expect(await within(screen.getByRole('dialog')).findByText('이용이 제한된 계정이라 탈퇴할 수 없어요.')).toBeInTheDocument()
    expect(getIsLoggedIn()).toBe(true)
  })

  it('[AC-WITHDRAW-006] DELETE가 409/30003이면 이미 탈퇴한 계정이라고 안내한다', async () => {
    server.use(http.delete(USER_ME_URL, () => errorBody(30003, '이미 탈퇴한 계정입니다.', 409)))
    const user = userEvent.setup()
    renderAt('/mypage/withdraw')

    await confirmWithdraw(user)

    expect(await screen.findByText('이미 탈퇴한 계정이에요.')).toBeInTheDocument()
  })

  it('[AC-WITHDRAW-007] 탈퇴 가능 여부 조회가 500이면 재시도 버튼 없이 인라인으로 안내한다', async () => {
    server.use(http.get(WITHDRAWAL_CHECK_URL, () => errorBody(90000, '서버 오류', 500)))
    renderAt('/mypage/withdraw')

    expect(await screen.findByText('탈퇴 가능 여부를 확인하지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '탈퇴하기' })).not.toBeInTheDocument()
  })
})

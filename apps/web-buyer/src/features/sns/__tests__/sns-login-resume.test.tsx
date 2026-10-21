import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
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

const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent

// 비로그인으로 프로필에서 행동을 누르고 로그인 / 회원가입까지 간다. 로그인 화면은 페이지 전체를 이동하므로
// 화면을 내리고(cleanup) 서버 상태를 로그인한 계정으로 바꾼 뒤 /login/complete로 새로 연다.
async function startAsGuest(publicId: string, press: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  logout()
  seedSns({ viewer: null })
  const user = userEvent.setup()
  const router = renderAt(`/sns/users/${publicId}`)
  await press(user)
  await user.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
  cleanup()
  return user
}

function completeLogin(viewerSeed: Parameters<typeof seedSns>[0] = {}) {
  seedSns({ viewer: SNS_ME, ...viewerSeed })
  return renderAt('/login/complete?status=ACTIVE')
}

const pressFollow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '팔로우' }))
}

let followPosts = 0

beforeEach(() => {
  resetAuth()
  followPosts = 0
  server.use(
    http.post(WEB_REFRESH_URL, () =>
      HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
    ),
  )
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/sns\/users\/[^/]+\/follow$/.test(request.url)) followPosts += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
  setAccessToken(null)
})

describe('로그인 뒤 다시 실행(A26)', () => {
  it('[AC-SNS01-011] 로그인을 마치면 원래 프로필로 돌아와 확인 없이 팔로우하고 버튼이 팔로잉으로 바뀐다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    expect(followPosts).toBe(0)

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(stat('팔로워')).toBe('3')
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-012] 로그인한 계정이 이미 팔로우 중이면 상태와 수가 그대로다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)

    completeLogin({ follows: [snsRelation(SNS_MONG, SNS_COCO), snsRelation(SNS_ME, SNS_COCO)] })

    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    await waitFor(() => expect(followPosts).toBe(1))
    await waitFor(() => expect(stat('팔로워')).toBe('2'))
    expect(currentSns().follows.filter(r => r.to === SNS_COCO)).toHaveLength(2)
  })

  it('[AC-SNS01-013] 로그인 사이에 상대가 나를 차단했으면 팔로우하지 않고 볼 수 없는 계정 안내를 보여준다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)

    completeLogin({ blocks: [snsRelation(SNS_COCO, SNS_ME)] })

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    expect(followPosts).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 로그인한 계정이 그 프로필 본인이면 다시 실행하지 않고 내 프로필로 간다', async () => {
    await startAsGuest(SNS_ME, pressFollow)

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))
    expect(await screen.findByRole('button', { name: '프로필 수정' })).toBeInTheDocument()
    expect(followPosts).toBe(0)
  })

  it('[AC-SNS01-011] 차단은 다시 실행하지 않고 확인 Modal만 다시 연다', async () => {
    await startAsGuest(SNS_COCO, async user => {
      await user.click(await screen.findByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: '차단하기' }))
    })

    completeLogin()

    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
  })

  it('[AC-SNS01-011] 로그인이 실패해 ?error=로 돌아오면 대기 행동을 버린다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    expect(sessionStorage.length).toBe(1)

    const router = renderAt('/login/complete?error=20001')

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 대기 행동이 없으면 로그인 뒤 홈으로 간다', async () => {
    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

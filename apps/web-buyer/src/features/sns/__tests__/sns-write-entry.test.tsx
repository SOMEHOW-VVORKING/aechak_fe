import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetAuth } from '@/shared/auth'
import { SNS_ME, WEB_REFRESH_URL, seedSns, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 글쓰기 진입점은 SNS 공개 전(SNS_SERVER_AVAILABLE=false)에는 숨긴다. 열림과 닫힘을 모두 본다.
const flags = vi.hoisted(() => ({ available: true }))
vi.mock('@/shared/sns-availability', () => ({
  get SNS_SERVER_AVAILABLE() {
    return flags.available
  },
}))

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

function asGuest() {
  resetAuth()
  setAccessToken(null)
  seedSns({ viewer: null })
}

beforeEach(() => {
  flags.available = true
  setAccessToken('test-token')
})

describe('SNS 탭 글쓰기', () => {
  it('로그인한 사용자가 글쓰기를 누르면 작성 화면이 열린다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns')

    await user.click(await screen.findByRole('button', { name: '글쓰기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/posts/new'))
  })

  it('[AC-SNS02-001][AC-SNS02-003] 비로그인이 글쓰기를 누르면 작성 화면 대신 로그인 안내 시트가 열리고 둘러보기 계속은 시트만 닫는다', async () => {
    asGuest()
    const user = userEvent.setup()
    const router = renderAt('/sns')

    await user.click(await screen.findByRole('button', { name: '글쓰기' }))
    expect(await screen.findByText(/글 작성은 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sns')

    await user.click(screen.getByRole('button', { name: '둘러보기 계속하기' }))
    expect(router.state.location.pathname).toBe('/sns')
    expect(screen.getByRole('button', { name: '글쓰기' })).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS02-002] 로그인을 마치면 SNS 탭으로 돌아와 작성 화면을 다시 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns')
    await user.click(await screen.findByRole('button', { name: '글쓰기' }))
    await user.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guestRouter.state.location.pathname).toBe('/onboarding/login'))
    // 로그인은 페이지 전체를 이동한다. 화면을 내리고 refresh 쿠키가 생긴 상태로 /login/complete를 새로 연다.
    cleanup()

    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME })
    const router = renderAt('/login/complete?status=ACTIVE&isNew=false')

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/posts/new'))
    expect(await screen.findByLabelText('캡션')).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('SNS 공개 전에는 글쓰기 진입점을 숨기고 작성 라우트는 그대로 동작한다', async () => {
    flags.available = false
    renderAt('/sns')
    expect(await screen.findByText('준비 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '글쓰기' })).not.toBeInTheDocument()
    cleanup()

    renderAt('/sns/posts/new')
    expect(await screen.findByLabelText('캡션')).toBeInTheDocument()
  })
})

// 하단 SNS 탭은 SNS 공개 뒤에만 피드를 그리고 /sns/feed는 상수와 관계없이 피드를 연다(SNS-03 design 6절 1번).
describe('SNS 탭 피드', () => {
  it('SNS 공개 뒤에는 SNS 탭이 피드와 글쓰기 버튼을 그린다', async () => {
    renderAt('/sns')
    expect(await screen.findByRole('heading', { name: '애착 SNS' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '팔로잉' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('보리 생일')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '글쓰기' })).toBeInTheDocument()
  })

  it('SNS 공개 전에도 /sns/feed는 피드를 그리고 글쓰기 버튼은 SNS 탭과 같이 숨긴다', async () => {
    flags.available = false
    renderAt('/sns/feed')
    expect(await screen.findByRole('heading', { name: '애착 SNS' })).toBeInTheDocument()
    expect(await screen.findByText('보리 생일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '글쓰기' })).not.toBeInTheDocument()
  })
})

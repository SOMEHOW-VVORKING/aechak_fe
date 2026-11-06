import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, delay, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_CHOCO,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_POST_LIKE_URL,
  SNS_POST_MINE,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsLike,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function asGuest() {
  logout()
  seedSns({ viewer: null })
}

const postPath = (publicId: string) => `/sns/posts/${publicId}`
const EXPLORE = '/sns/feed?tab=explore'
const cardOf = (nickname: string) =>
  screen.getAllByRole('button', { name: `${nickname}님의 게시물 보기` })[0]!.closest('article')!
const likeIn = (scope: HTMLElement) => within(scope).getByRole('button', { name: '좋아요' })
const likeCount = (scope: HTMLElement) =>
  within(scope)
    .getByRole('button', { name: /^좋아요한 사람/ })
    .textContent?.replace('좋아요한 사람', '')
    .trim()
const liked = (user: string, post: string) =>
  currentSns().likes.some(r => r.user === user && r.target === post)

let likeRequests: string[] = []
let likersRequests = 0

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  likeRequests = []
  likersRequests = 0
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/like')) likeRequests.push(`${request.method} ${path}`)
    if (path.endsWith('/likers')) likersRequests += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('게시물 좋아요 버튼', () => {
  it('[AC-SNS04-001] 상세에서 누르면 바로 채워지고 수가 1 늘며 다시 누르면 비워지고 수가 1 준다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    const article = await screen.findByRole('article')
    expect(likeIn(article)).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(article)).toBe('0')

    await user.click(likeIn(article))
    expect(likeIn(article)).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(article)).toBe('1')
    await waitFor(() => expect(liked(SNS_ME, SNS_POST_COCO)).toBe(true))

    await user.click(likeIn(article))
    expect(likeIn(article)).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(article)).toBe('0')
    await waitFor(() => expect(liked(SNS_ME, SNS_POST_COCO)).toBe(false))
  })

  it('[AC-SNS04-001] 요청이 끝날 때까지 같은 게시물의 다음 누르기는 보내지 않아 연타해도 좋아요는 하나다', async () => {
    // 켜기 응답을 붙잡아 두고 그동안 누른다.
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    server.use(
      http.post(SNS_POST_LIKE_URL, async () => {
        await held
      }),
    )
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })

    for (let i = 0; i < 3; i += 1) await user.click(likeIn(cardOf('코코집사')))
    expect(likeIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true')
    expect(likeRequests).toEqual([`POST /api/v1/sns/posts/${SNS_POST_COCO}/like`])

    release()
    await waitFor(() => expect(liked(SNS_ME, SNS_POST_COCO)).toBe(true))
    expect(likeIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(cardOf('코코집사'))).toBe('1')
    expect(likeRequests).toHaveLength(1)
  })

  it('[AC-SNS04-001] 성공하면 응답의 likeCount를 그린다', async () => {
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    // 카드를 받은 뒤 다른 두 사람이 좋아요를 눌렀다.
    seedSns({
      ...currentSns(),
      likes: [snsLike(SNS_MONG, SNS_POST_COCO), snsLike(SNS_CHOCO, SNS_POST_COCO)],
    })

    await user.click(likeIn(cardOf('코코집사')))
    await waitFor(() => expect(likeCount(cardOf('코코집사'))).toBe('3'))
    expect(likeIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true')
  })

  it('[AC-SNS04-002] 요청이 실패하면 버튼과 수가 누르기 전으로 돌아가고 실패 안내가 나온다', async () => {
    seedSns({ likes: [snsLike(SNS_MONG, SNS_POST_COCO)] })
    server.use(
      http.post(SNS_POST_LIKE_URL, async () => {
        await delay(30)
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    const article = await screen.findByRole('article')

    await user.click(likeIn(article))
    expect(likeCount(article)).toBe('2')

    expect(
      await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요'),
    ).toBeInTheDocument()
    expect(likeIn(article)).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(article)).toBe('1')
  })

  it('[AC-SNS04-003] 자기 게시물에도 좋아요를 누를 수 있다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_MINE))
    const article = await screen.findByRole('article')

    await user.click(likeIn(article))
    await waitFor(() => expect(liked(SNS_ME, SNS_POST_MINE)).toBe(true))
    expect(likeCount(article)).toBe('1')
  })

  it('[AC-SNS04-004] 그사이 지워진 게시물이면 삭제된 게시물 안내가 나오고 되돌아간다', async () => {
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    seedSns({
      ...currentSns(),
      posts: currentSns().posts.map(p =>
        p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p,
      ),
    })

    await user.click(likeIn(cardOf('코코집사')))
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(likeIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(cardOf('코코집사'))).toBe('0')
  })

  it('[AC-SNS04-004] 상세에서 그사이 지워진 게시물이면 상세를 다시 읽어 삭제된 게시물 안내로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    const article = await screen.findByRole('article')
    seedSns({
      ...currentSns(),
      posts: currentSns().posts.map(p =>
        p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p,
      ),
    })

    await user.click(likeIn(article))
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    expect(screen.getAllByText('삭제된 게시물이에요').length).toBeGreaterThan(0)
  })

  it('[AC-SNS04-037] 이용 제한 계정은 이용이 제한된 계정이라는 안내다', async () => {
    seedSns({ restricted: [SNS_ME] })
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(likeIn(await screen.findByRole('article')))
    expect(
      await screen.findByText('이용이 제한된 계정이라 이 기능을 사용할 수 없어요'),
    ).toBeInTheDocument()
  })

  it('[AC-SNS04-008] 좋아요 수를 누르면 좋아요한 사람 화면으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt(postPath(SNS_POST_COCO))

    await user.click(
      within(await screen.findByRole('article')).getByRole('button', { name: /^좋아요한 사람/ }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${postPath(SNS_POST_COCO)}/likers`),
    )
  })
})

describe('비로그인 좋아요', () => {
  // 로그인은 페이지 전체를 이동한다. 화면을 내리고 refresh 쿠키가 생긴 상태로 /login/complete를 새로 연다.
  async function loginAndReturn(
    guestRouter: ReturnType<typeof renderAt>,
    seed: Parameters<typeof seedSns>[0] = {},
  ) {
    await userEvent.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guestRouter.state.location.pathname).toBe('/onboarding/login'))
    cleanup()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME, ...seed })
    return renderAt('/login/complete?status=ACTIVE&isNew=false')
  }

  it('[AC-SNS04-006] 상세에서 좋아요를 누르면 로그인 안내 시트가 열리고 로그인 뒤 같은 상세로 돌아와 한 번 켜진다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(likeIn(await screen.findByRole('article')))
    expect(await screen.findByText(/좋아요는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(likeRequests).toEqual([])

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO)))
    await waitFor(() =>
      expect(likeIn(screen.getByRole('article'))).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(likeCount(screen.getByRole('article'))).toBe('1')
    expect(likeRequests).toEqual([`POST /api/v1/sns/posts/${SNS_POST_COCO}/like`])
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS04-006] 로그인하는 사이 지워진 게시물이면 좋아요를 보내지 않고 삭제된 게시물 안내를 보여준다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(likeIn(await screen.findByRole('article')))
    const posts = currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p))

    const router = await loginAndReturn(guestRouter, { posts })
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO)))
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(likeRequests).toEqual([])
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS04-006] 카드에서 누르고 로그인한 계정이 이미 좋아요했으면 그대로다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    await user.click(likeIn(cardOf('코코집사')))

    const router = await loginAndReturn(guestRouter, { likes: [snsLike(SNS_ME, SNS_POST_COCO)] })
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/feed'))
    await waitFor(() => expect(likeRequests).toHaveLength(1))
    await waitFor(() => expect(likeIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true'))
    expect(likeCount(cardOf('코코집사'))).toBe('1')
    expect(currentSns().likes).toHaveLength(1)
  })

  it('[AC-SNS04-007] 좋아요 수를 누르면 목록 대신 로그인 안내 시트가 열리고 로그인 뒤 좋아요한 사람으로 돌아온다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(
      within(await screen.findByRole('article')).getByRole('button', { name: /^좋아요한 사람/ }),
    )
    expect(
      await screen.findByText(/좋아요한 사람 목록은 로그인한 회원만 볼 수 있어요/),
    ).toBeInTheDocument()
    expect(guestRouter.state.location.pathname).toBe(postPath(SNS_POST_COCO))

    const router = await loginAndReturn(guestRouter)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${postPath(SNS_POST_COCO)}/likers`),
    )
    expect(await screen.findByText('아직 좋아요가 없어요')).toBeInTheDocument()
    expect(likersRequests).toBe(1)
  })
})

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
  SNS_COMMENT_LIKE_URL,
  SNS_COMMENTS_URL,
  SNS_COMMENT_MINE,
  SNS_COMMENT_MONG,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_REPLY_COCO,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsComment,
  snsExampleCommentLikes,
  snsExampleComments,
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

const postPath = (search = '') => `/sns/posts/${SNS_POST_COCO}${search}`
const list = () => within(screen.getByRole('region', { name: '댓글' })).getByRole('list')
const rowOf = (text: string) => within(list()).getByText(text).closest('li')!
const findRow = async (text: string) =>
  (await within(await screen.findByRole('region', { name: '댓글' })).findByText(text)).closest(
    'li',
  )!
const likeIn = (scope: HTMLElement) =>
  within(scope).getByRole('button', { name: /님 댓글 좋아요$/ })
const likeCount = (scope: HTMLElement) =>
  within(scope)
    .getByRole('button', { name: /님 댓글 좋아요한 사람/ })
    .textContent?.replace(/^.*님 댓글 좋아요한 사람/, '')
    .trim()
const liked = (user: string, comment: string) =>
  currentSns().likes.some(r => r.user === user && r.target === comment)

// 최상위 댓글이 한 페이지(20개)를 넘게 예시 댓글 뒤에 몽이아빠 댓글 20개를 더한다
const manyComments = () => [
  ...snsExampleComments(),
  ...Array.from({ length: 20 }, (_, i) =>
    snsComment(`01JG3${String(i).padStart(21, '0')}`, SNS_POST_COCO, SNS_MONG, {
      content: `더 있는 댓글 ${i}`,
      createdAt: `2026-10-23T${String(i).padStart(2, '0')}:00:00`,
    }),
  ),
]
const holdNextPage = () => {
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  server.use(
    http.get(SNS_COMMENTS_URL, async ({ request }) => {
      if (new URL(request.url).searchParams.get('cursor')) await held
    }),
  )
  return () => release()
}

const MONG_TEXT = '코코 표정 너무 좋네요'
const MINE_TEXT = '산책 코스 어디예요?'

let likeRequests: string[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  seedSns({ viewer: SNS_ME, comments: snsExampleComments(), likes: snsExampleCommentLikes() })
  likeRequests = []
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/like')) likeRequests.push(`${request.method} ${path}`)
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('댓글 좋아요 버튼', () => {
  it('[AC-SNS04-001] 누르면 바로 비워지고 수가 1 줄며 다시 누르면 채워지고 수가 1 는다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())
    const row = await findRow(MONG_TEXT)
    expect(likeIn(row)).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(row)).toBe('2')

    await user.click(likeIn(row))
    expect(likeIn(row)).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(row)).toBe('1')
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MONG)).toBe(false))

    await user.click(likeIn(rowOf(MONG_TEXT)))
    expect(likeIn(rowOf(MONG_TEXT))).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(rowOf(MONG_TEXT))).toBe('2')
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MONG)).toBe(true))
  })

  it('[AC-SNS04-001] 요청이 끝날 때까지 같은 댓글의 다음 누르기는 보내지 않아 연타해도 좋아요는 하나다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => (release = resolve))
    server.use(
      http.post(SNS_COMMENT_LIKE_URL, async () => {
        await held
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)

    for (let i = 0; i < 3; i += 1) await user.click(likeIn(rowOf(MINE_TEXT)))
    expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'true')
    expect(likeRequests).toEqual([`POST /api/v1/sns/comments/${SNS_COMMENT_MINE}/like`])

    release()
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(true))
    expect(likeCount(rowOf(MINE_TEXT))).toBe('2')
    expect(likeRequests).toHaveLength(1)
  })

  it('[AC-SNS04-001] 성공하면 응답의 likeCount를 그린다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)
    // 목록을 받은 뒤 다른 사람이 내 댓글에 좋아요를 눌렀다.
    seedSns({
      ...currentSns(),
      likes: [...currentSns().likes, snsLike(SNS_CHOCO, SNS_COMMENT_MINE)],
    })

    await user.click(likeIn(rowOf(MINE_TEXT)))
    await waitFor(() => expect(likeCount(rowOf(MINE_TEXT))).toBe('3'))
  })

  it('[AC-SNS04-002] 요청이 실패하면 버튼과 수가 누르기 전으로 돌아가고 실패 안내가 나온다', async () => {
    server.use(
      http.post(SNS_COMMENT_LIKE_URL, async () => {
        await delay(30)
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath())
    const row = await findRow(MINE_TEXT)

    await user.click(likeIn(row))
    expect(likeCount(row)).toBe('2')

    expect(
      await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요'),
    ).toBeInTheDocument()
    expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'false')
    expect(likeCount(rowOf(MINE_TEXT))).toBe('1')
  })

  it('[AC-SNS04-003] 자기 댓글에도 좋아요를 누를 수 있다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())

    await user.click(likeIn(await findRow(MINE_TEXT)))
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(true))
    expect(likeCount(rowOf(MINE_TEXT))).toBe('2')
  })

  it('[AC-SNS04-005] 안내 문구만 남은 댓글에는 좋아요 버튼이 없다', async () => {
    renderAt(postPath())
    const placeholder = await findRow('삭제된 댓글이에요')

    expect(within(placeholder).queryByRole('button', { name: /님 댓글 좋아요$/ })).toBeNull()
    expect(
      within(rowOf('저도 궁금해요')).getByRole('button', { name: /님 댓글 좋아요$/ }),
    ).toBeInTheDocument()
  })

  it('그사이 지워진 댓글이면 댓글을 찾을 수 없다는 안내 뒤 목록을 다시 읽는다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)
    seedSns({
      ...currentSns(),
      comments: currentSns().comments.filter(c => c.publicId !== SNS_COMMENT_MINE),
    })

    await user.click(likeIn(rowOf(MINE_TEXT)))
    expect(await screen.findByText('댓글을 찾을 수 없어요')).toBeInTheDocument()
    await waitFor(() => expect(within(list()).queryByText(MINE_TEXT)).toBeNull())
  })

  it('[AC-SNS04-004] 그사이 지워진 게시물이면 상세를 다시 읽어 삭제된 게시물 안내로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)
    seedSns({
      ...currentSns(),
      posts: currentSns().posts.map(p =>
        p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p,
      ),
    })

    await user.click(likeIn(rowOf(MINE_TEXT)))
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())
    expect(screen.getAllByText('삭제된 게시물이에요').length).toBeGreaterThan(0)
  })

  it('[AC-SNS04-037] 이용 제한 계정은 이용이 제한된 계정이라는 안내다', async () => {
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)
    seedSns({ ...currentSns(), restricted: [SNS_ME] })

    await user.click(likeIn(rowOf(MINE_TEXT)))
    expect(
      await screen.findByText('이용이 제한된 계정이라 이 기능을 사용할 수 없어요'),
    ).toBeInTheDocument()
    expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'false')
  })

  it('알림으로 연 댓글을 목록에서 누르면 위에 고정한 같은 댓글도 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(`?comment=${SNS_REPLY_COCO}`))
    const pinned = await screen.findByRole('group', { name: '알림으로 연 댓글' })
    const pinnedReply = () =>
      within(pinned)
        .getByText('감사해요. 다음에 같이 산책해요')
        .closest('div[class*="items-start"]') as HTMLElement
    await waitFor(() =>
      expect(within(list()).getByText('감사해요. 다음에 같이 산책해요')).toBeInTheDocument(),
    )
    const row = rowOf('감사해요. 다음에 같이 산책해요')
    expect(likeCount(pinnedReply())).toBe('1')

    await user.click(likeIn(row))
    await waitFor(() => expect(liked(SNS_ME, SNS_REPLY_COCO)).toBe(true))
    expect(likeIn(pinnedReply())).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(pinnedReply())).toBe('2')
  })

  it('[AC-SNS04-009] 좋아요 수를 누르면 댓글 좋아요한 사람 화면으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt(postPath())

    await user.click(
      within(await findRow(MONG_TEXT)).getByRole('button', { name: /님 댓글 좋아요한 사람/ }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/sns/comments/${SNS_COMMENT_MONG}/likers`),
    )
  })
  it('좋아요 요청 중에는 더보기를 잠그고 다음 댓글을 받는 동안에는 좋아요를 잠근다', async () => {
    seedSns({ ...currentSns(), comments: manyComments() })
    let releaseLike = () => {}
    const heldLike = new Promise<void>(resolve => (releaseLike = resolve))
    server.use(
      http.post(SNS_COMMENT_LIKE_URL, async () => {
        await heldLike
      }),
    )
    const release = holdNextPage()
    const user = userEvent.setup()
    renderAt(postPath())
    await findRow(MINE_TEXT)

    await user.click(likeIn(rowOf(MINE_TEXT)))
    expect(screen.getByRole('button', { name: '댓글 더보기' })).toBeDisabled()
    releaseLike()
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(true))
    await waitFor(() => expect(screen.getByRole('button', { name: '댓글 더보기' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: '댓글 더보기' }))
    await waitFor(() => expect(likeIn(rowOf(MINE_TEXT))).toBeDisabled())
    release()
    await within(list()).findByText('더 있는 댓글 19')
    expect(likeIn(rowOf(MINE_TEXT))).toBeEnabled()
    expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('비로그인 댓글 좋아요', () => {
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
    seedSns({ ...currentSns(), viewer: SNS_ME, ...seed })
    return renderAt('/login/complete?status=ACTIVE&isNew=false')
  }

  beforeEach(() => {
    logout()
    seedSns({ viewer: null, comments: snsExampleComments(), likes: snsExampleCommentLikes() })
  })

  it('[AC-SNS04-006] 댓글 좋아요를 누르면 로그인 안내 시트가 열리고 로그인 뒤 같은 상세로 돌아와 그 댓글에 한 번 켜진다', async () => {
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath())
    const row = await findRow(MINE_TEXT)
    expect(likeIn(row)).toHaveAttribute('aria-pressed', 'false')

    await user.click(likeIn(row))
    expect(await screen.findByText(/좋아요는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(likeRequests).toEqual([])

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath()))
    await waitFor(() => expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'true'))
    expect(likeCount(rowOf(MINE_TEXT))).toBe('2')
    expect(likeRequests).toEqual([`POST /api/v1/sns/comments/${SNS_COMMENT_MINE}/like`])
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS04-006] 로그인한 계정이 이미 좋아요한 댓글이면 그대로다', async () => {
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath())
    await user.click(likeIn(await findRow(MONG_TEXT)))

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath()))
    await waitFor(() => expect(likeRequests).toHaveLength(1))
    expect(likeIn(rowOf(MONG_TEXT))).toHaveAttribute('aria-pressed', 'true')
    expect(likeCount(rowOf(MONG_TEXT))).toBe('2')
    expect(currentSns().likes.filter(r => r.target === SNS_COMMENT_MONG)).toHaveLength(2)
  })

  it('[AC-SNS04-006] 로그인하는 사이 볼 수 없게 된 댓글이면 켜지지 않고 댓글을 찾을 수 없다는 안내다', async () => {
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath())
    await user.click(likeIn(await findRow(MINE_TEXT)))
    const router = await loginAndReturn(guestRouter, {
      comments: currentSns().comments.filter(c => c.publicId !== SNS_COMMENT_MINE),
    })
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath()))
    await findRow(MONG_TEXT)
    expect(await screen.findByText('댓글을 찾을 수 없어요')).toBeInTheDocument()
    expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(false)
  })

  it('[AC-SNS04-007] 좋아요 수를 누르면 목록 대신 로그인 안내 시트가 열리고 로그인 뒤 댓글 좋아요한 사람으로 돌아온다', async () => {
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath())
    await user.click(
      within(await findRow(MONG_TEXT)).getByRole('button', { name: /님 댓글 좋아요한 사람/ }),
    )
    expect(
      await screen.findByText(/좋아요한 사람 목록은 로그인한 회원만 볼 수 있어요/),
    ).toBeInTheDocument()

    const router = await loginAndReturn(guestRouter)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/sns/comments/${SNS_COMMENT_MONG}/likers`),
    )
    expect(await screen.findByText('좋아요한 2명을 표시했어요')).toBeInTheDocument()
  })

  it('[AC-SNS04-006] 로그인 뒤 다시 켠 좋아요는 목록을 처음부터 다시 불러와도 한 번만 보낸다', async () => {
    seedSns({ ...currentSns(), comments: manyComments() })
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath())
    await user.click(likeIn(await findRow(MINE_TEXT)))

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath()))
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(true))
    await user.click(likeIn(rowOf(MINE_TEXT)))
    await waitFor(() => expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(false))

    // 낡은 커서(90002)면 목록을 처음부터 다시 읽는다
    server.use(
      http.get(SNS_COMMENTS_URL, ({ request }) => {
        if (new URL(request.url).searchParams.get('cursor')) {
          return HttpResponse.json({ errorCode: 90002, message: '' }, { status: 400 })
        }
      }),
    )
    await user.click(screen.getByRole('button', { name: '댓글 더보기' }))
    await waitFor(() => expect(likeIn(rowOf(MINE_TEXT))).toHaveAttribute('aria-pressed', 'false'))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(likeRequests).toEqual([
      `POST /api/v1/sns/comments/${SNS_COMMENT_MINE}/like`,
      `DELETE /api/v1/sns/comments/${SNS_COMMENT_MINE}/like`,
    ])
    expect(liked(SNS_ME, SNS_COMMENT_MINE)).toBe(false)
  })
})

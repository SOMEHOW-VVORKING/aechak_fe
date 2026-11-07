import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COMMENTS_URL,
  SNS_COMMENT_MONG,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsComment,
  snsExampleComments,
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

const postPath = `/sns/posts/${SNS_POST_COCO}`
const section = () => screen.getByRole('region', { name: '댓글' })
const input = () => screen.getByRole('textbox', { name: '댓글 입력' })
const submit = () => screen.getByRole('button', { name: '게시' })
const rowTexts = () =>
  within(section())
    .getAllByRole('listitem')
    .map(row => row.textContent)
const myComments = () => currentSns().comments.filter(r => r.author === SNS_ME)

async function openDetail() {
  renderAt(postPath)
  await within(await screen.findByRole('region', { name: '댓글' })).findByText(
    '코코 표정 너무 좋네요',
  )
}

let posts: Array<{ key: string | null; body: { content: string; parentPublicId: string | null } }> =
  []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  seedSns({ viewer: SNS_ME, comments: snsExampleComments() })
  posts = []
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/comments')) {
      posts.push({
        key: request.headers.get('Idempotency-Key'),
        body: await request.clone().json(),
      })
    }
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('댓글 작성', () => {
  it('[AC-SNS04-019] 최상위 댓글은 목록 끝에 붙고 입력이 비며 상세 수가 오른다', async () => {
    const user = userEvent.setup()
    await openDetail()
    expect(input()).toHaveAttribute('placeholder', '코코집사님에게 답글 남기기…')

    await user.type(input(), '  산책 같이 가요  ')
    await user.click(submit())

    await waitFor(() => expect(rowTexts().at(-1)).toContain('산책 같이 가요'))
    expect(input()).toHaveValue('')
    expect(posts).toEqual([
      { key: expect.any(String), body: { content: '  산책 같이 가요  ', parentPublicId: null } },
    ])
    await waitFor(() => expect(within(section()).getByRole('heading').textContent).toBe('답글 5'))
  })

  it('[AC-SNS04-020] 답글달기를 누르면 그 댓글에 답글을 보내고 그 스레드 끝에 넣는다', async () => {
    const user = userEvent.setup()
    await openDetail()

    await user.click(within(section()).getAllByRole('button', { name: '답글달기' })[0]!)
    expect(screen.getByText('몽이아빠님에게 답글 남기는 중')).toBeInTheDocument()
    expect(input()).toHaveAttribute('placeholder', '몽이아빠님에게 답글 남기기…')
    expect(input()).toHaveFocus()
    await user.type(input(), '저도 끼워 주세요')
    await user.click(submit())

    await waitFor(() => expect(rowTexts()[2]).toContain('저도 끼워 주세요'))
    expect(posts[0]!.body.parentPublicId).toBe(SNS_COMMENT_MONG)
    expect(myComments().at(-1)!.parent).toBe(SNS_COMMENT_MONG)
    expect(screen.queryByText('몽이아빠님에게 답글 남기는 중')).toBeNull()
  })

  it('[AC-SNS04-019] 비었거나 500자를 넘으면 게시가 꺼지고 넘은 입력도 자르지 않는다', async () => {
    const user = userEvent.setup()
    await openDetail()
    expect(submit()).toBeDisabled()

    await user.type(input(), '   ')
    expect(submit()).toBeDisabled()

    await user.clear(input())
    await user.click(input())
    await user.paste('가'.repeat(501))
    expect(input()).toHaveValue('가'.repeat(501))
    expect(input()).not.toHaveAttribute('maxLength')
    expect(screen.getByText('501/500')).toHaveClass('text-error-fg')
    expect(submit()).toBeDisabled()

    await user.type(input(), '{Backspace}')
    expect(submit()).toBeEnabled()
  })

  it('[AC-SNS04-021][AC-SNS04-023] 실패하면 입력이 남고 다시 게시해도 같은 키로 보내 댓글은 하나다', async () => {
    let failOnce = true
    server.use(
      http.post(SNS_COMMENTS_URL, () => {
        if (!failOnce) return undefined
        failOnce = false
        return HttpResponse.json({ errorCode: 90000, message: 'error' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    await openDetail()

    await user.type(input(), '다시 보내기')
    await user.click(submit())
    expect(
      await screen.findByText('댓글을 등록하지 못했어요. 다시 시도해 주세요'),
    ).toBeInTheDocument()
    expect(input()).toHaveValue('다시 보내기')

    await user.click(submit())
    await waitFor(() => expect(input()).toHaveValue(''))
    expect(posts.map(p => p.key)).toEqual([posts[0]!.key, posts[0]!.key])
    expect(myComments().filter(r => r.content === '다시 보내기')).toHaveLength(1)

    // 게시가 끝난 뒤의 입력은 새 키다.
    await user.type(input(), '다시 보내기')
    await user.click(submit())
    await waitFor(() => expect(posts).toHaveLength(3))
    expect(posts[2]!.key).not.toBe(posts[0]!.key)
  })

  it('[AC-SNS04-022] 금지어가 많으면 안내하고 입력을 남긴다', async () => {
    const user = userEvent.setup()
    await openDetail()

    await user.type(input(), '욕설 욕설 산책')
    await user.click(submit())

    expect(await screen.findByText('부적절한 표현이 있어 등록할 수 없어요')).toBeInTheDocument()
    expect(input()).toHaveValue('욕설 욕설 산책')
  })

  it('[AC-SNS04-022] 그사이 지운 최상위 댓글에 답글을 보내면 130705 안내 뒤 목록을 다시 읽고 입력은 남긴다', async () => {
    const user = userEvent.setup()
    await openDetail()
    await user.click(within(section()).getAllByRole('button', { name: '답글달기' })[0]!)
    // 다른 기기에서 몽이아빠가 댓글을 지웠다.
    seedSns({
      ...currentSns(),
      comments: currentSns().comments.map(r =>
        r.publicId === SNS_COMMENT_MONG ? { ...r, deleted: true, content: null } : r,
      ),
    })

    await user.type(input(), '늦은 답글')
    await user.click(submit())

    expect(await screen.findByText('답글을 달 수 없는 댓글이에요')).toBeInTheDocument()
    expect(input()).toHaveValue('늦은 답글')
    await waitFor(() => expect(rowTexts()[0]).toContain('삭제된 댓글이에요'))
  })

  it('[AC-SNS04-034] 끝까지 부르지 않은 목록에서 쓴 최상위 댓글은 아래에 붙이고 이어 부른 페이지에 나오면 한 번만 그린다', async () => {
    const roots = Array.from({ length: 21 }, (_, i) =>
      snsComment(`01KB${String(i).padStart(22, '0')}`, SNS_POST_COCO, SNS_MONG, {
        content: `댓글 ${i + 1}`,
      }),
    )
    seedSns({ viewer: SNS_ME, comments: roots })
    const user = userEvent.setup()
    renderAt(postPath)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText('댓글 20')

    await user.type(input(), '방금 쓴 댓글')
    await user.click(submit())
    await waitFor(() => expect(rowTexts().at(-1)).toContain('방금 쓴 댓글'))
    expect(rowTexts()).toHaveLength(21)

    await user.click(screen.getByRole('button', { name: '댓글 더보기' }))
    await within(section()).findByText('댓글 21')
    expect(rowTexts().filter(text => text?.includes('방금 쓴 댓글'))).toHaveLength(1)
    expect(rowTexts()).toHaveLength(22)
  })
})

describe('비로그인 댓글', () => {
  async function loginAndReturn(guestRouter: ReturnType<typeof renderAt>) {
    await userEvent.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guestRouter.state.location.pathname).toBe('/onboarding/login'))
    cleanup()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ ...currentSns(), viewer: SNS_ME })
    return renderAt('/login/complete?status=ACTIVE&isNew=false')
  }

  function asGuest() {
    logout()
    setAccessToken(null)
    seedSns({ viewer: null, comments: snsExampleComments() })
  }

  it('[AC-SNS04-017] 입력창을 누르면 로그인 안내를 열고 로그인 뒤 같은 상세의 입력창으로 돌아온다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    await user.click(input())
    expect(await screen.findByText(/댓글은 로그인한 회원만 쓸 수 있어요/)).toBeInTheDocument()

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '댓글 입력' })).toHaveFocus())
    expect(posts).toEqual([])
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS04-017] 답글달기였으면 로그인 뒤 그 댓글의 답글 입력창으로 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    await user.click(within(section()).getAllByRole('button', { name: '답글달기' })[0]!)
    await loginAndReturn(guestRouter)

    expect(await screen.findByText('몽이아빠님에게 답글 남기는 중')).toBeInTheDocument()
    expect(posts).toEqual([])
  })

  it('[AC-SNS04-017] 그사이 답글을 달 수 없게 됐으면 입력창을 열지 않고 안내만 한다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )
    await user.click(within(section()).getAllByRole('button', { name: '답글달기' })[0]!)
    seedSns({
      ...currentSns(),
      comments: currentSns().comments.map(r =>
        r.publicId === SNS_COMMENT_MONG ? { ...r, deleted: true, content: null } : r,
      ),
    })

    await loginAndReturn(guestRouter)

    expect(await screen.findByText('답글을 달 수 없는 댓글이에요')).toBeInTheDocument()
    expect(screen.queryByText(/님에게 답글 남기는 중/)).toBeNull()
  })
})

describe('목록 아래에 붙인 댓글', () => {
  async function postBelowUnloadedPage(user: ReturnType<typeof userEvent.setup>) {
    const roots = Array.from({ length: 21 }, (_, i) =>
      snsComment(`01KB${String(i).padStart(22, '0')}`, SNS_POST_COCO, SNS_MONG, {
        content: `댓글 ${i + 1}`,
      }),
    )
    seedSns({ viewer: SNS_ME, comments: roots })
    renderAt(postPath)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText('댓글 20')
    await user.type(input(), '방금 쓴 댓글')
    await user.click(submit())
    await waitFor(() => expect(rowTexts().at(-1)).toContain('방금 쓴 댓글'))
  }
  const lastRow = () => within(section()).getAllByRole('listitem').at(-1)!

  it('[AC-SNS04-034] 고치면 붙인 댓글도 바뀐 내용과 수정됨을 그린다', async () => {
    const user = userEvent.setup()
    await postBelowUnloadedPage(user)

    await user.click(within(lastRow()).getByRole('button', { name: '수정' }))
    const editor = screen.getByRole('textbox', { name: '댓글 수정' })
    await user.clear(editor)
    await user.type(editor, '고친 댓글')
    await user.click(within(editor.closest('li')!).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(lastRow()).toHaveTextContent('고친 댓글'))
    expect(lastRow()).toHaveTextContent('수정됨')
  })

  it('[AC-SNS04-034] 지우면 붙인 댓글이 목록에서 빠진다', async () => {
    const user = userEvent.setup()
    await postBelowUnloadedPage(user)

    await user.click(within(lastRow()).getByRole('button', { name: '삭제' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(within(section()).queryByText('방금 쓴 댓글')).toBeNull())
    expect(rowTexts()).toHaveLength(20)
  })

  it('[AC-SNS04-034] 붙인 댓글에 단 답글은 그 아래에 바로 보인다', async () => {
    const user = userEvent.setup()
    await postBelowUnloadedPage(user)

    await user.click(within(lastRow()).getByRole('button', { name: '답글달기' }))
    await user.type(input(), '내 댓글에 단 답글')
    await user.click(submit())

    await waitFor(() => expect(lastRow()).toHaveTextContent('내 댓글에 단 답글'))
    expect(rowTexts().at(-2)).toContain('방금 쓴 댓글')
  })
})

describe('게시물을 볼 수 없게 된 뒤의 댓글', () => {
  it('[AC-SNS04-022] 그사이 지운 게시물에 댓글을 쓰면 상세가 삭제된 게시물 안내로 바뀐다', async () => {
    const user = userEvent.setup()
    await openDetail()
    seedSns({
      ...currentSns(),
      posts: currentSns().posts.map(p =>
        p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p,
      ),
    })

    await user.type(input(), '늦은 댓글')
    await user.click(submit())

    // 토스트와 상세 안내가 같은 문구다. 상세가 바뀌면 댓글 영역과 입력창이 사라진다.
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '댓글 입력' })).toBeNull())
    expect(screen.queryByRole('region', { name: '댓글' })).toBeNull()
    expect(screen.getByText('게시물이 삭제되어 더 이상 볼 수 없어요.')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_COMMENTS_URL,
  SNS_COMMENT_MINE,
  SNS_COMMENT_MONG,
  SNS_COMMENT_URL,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_REPLY_COCO,
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

const postPath = (publicId: string, search = '') => `/sns/posts/${publicId}${search}`
const section = () => screen.getByRole('region', { name: '댓글' })
const rows = () => within(section()).getAllByRole('listitem')
const rowOf = (text: string) => within(section()).getByText(text).closest('li')!

let requests: string[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  seedSns({ viewer: SNS_ME, comments: snsExampleComments() })
  requests = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.includes('/comments') || url.pathname.endsWith('/block')) {
      requests.push(`${request.method} ${url.pathname}${url.search}`)
    }
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('댓글 목록', () => {
  it('[AC-SNS04-016][AC-SNS04-018] 오래된순 스레드로 그리고 대댓글은 들여쓰며 헤더 수는 상세 commentCount다', async () => {
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    expect(rows().map(row => row.textContent)).toEqual([
      expect.stringContaining('코코 표정 너무 좋네요'),
      expect.stringContaining('감사해요. 다음에 같이 산책해요'),
      expect.stringContaining('삭제된 댓글이에요'),
      expect.stringContaining('저도 궁금해요'),
      expect.stringContaining('산책 코스 어디예요?'),
    ])
    // 지운 최상위 댓글은 수에서 빠진다(안내 문구는 그려도 세지 않는다).
    expect(within(section()).getByRole('heading').textContent).toBe('답글 4')
    expect(within(section()).getByText('오래된순').tagName).toBe('SPAN')
    expect(rowOf('감사해요. 다음에 같이 산책해요').firstElementChild).toHaveClass('pl-14')
    expect(rowOf('코코 표정 너무 좋네요').firstElementChild).toHaveClass('pl-4')
    expect(within(rowOf('감사해요. 다음에 같이 산책해요')).getByText('수정됨')).toBeInTheDocument()
  })

  it('[AC-SNS04-005][AC-SNS04-031] 지운 최상위 댓글은 안내 문구만 그리고 그 아래 대댓글에는 답글달기가 없다', async () => {
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '삭제된 댓글이에요',
    )

    const placeholder = rowOf('삭제된 댓글이에요')
    expect(within(placeholder).queryByRole('button')).toBeNull()
    expect(within(rowOf('저도 궁금해요')).queryByRole('button', { name: '답글달기' })).toBeNull()
    expect(
      within(rowOf('코코 표정 너무 좋네요')).getByRole('button', { name: '답글달기' }),
    ).toBeInTheDocument()
    expect(
      within(rowOf('감사해요. 다음에 같이 산책해요')).getByRole('button', { name: '답글달기' }),
    ).toBeInTheDocument()
  })

  it('[AC-SNS04-033] 프로필이 없는 작성자의 댓글은 탈퇴 안내 문구로 그린다', async () => {
    seedSns({
      viewer: SNS_ME,
      comments: [
        snsComment('01KC0000000000000000000099', SNS_POST_COCO, '01JWITHDRAWN00000000000000'),
      ],
    })
    renderAt(postPath(SNS_POST_COCO))

    const row = (
      await within(await screen.findByRole('region', { name: '댓글' })).findByText(
        '탈퇴한 사용자가 작성한 댓글이에요',
      )
    ).closest('li')!
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('수정과 삭제는 내 댓글에만 보인다', async () => {
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '산책 코스 어디예요?',
    )

    expect(
      within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }),
    ).toBeInTheDocument()
    expect(
      within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '삭제' }),
    ).toBeInTheDocument()
    expect(
      within(rowOf('코코 표정 너무 좋네요')).queryByRole('button', { name: '수정' }),
    ).toBeNull()
  })

  it('[AC-SNS04-018] 댓글이 없으면 첫 댓글을 권한다', async () => {
    seedSns({ viewer: SNS_ME })
    renderAt(postPath(SNS_POST_COCO))

    expect(await screen.findByText('아직 댓글이 없어요')).toBeInTheDocument()
    expect(screen.getByText('첫 댓글을 남겨 보세요.')).toBeInTheDocument()
  })

  it('[AC-SNS04-016] 더보기로 다음 페이지를 이어 부르고 끝까지 부르면 더보기가 사라진다', async () => {
    const roots = Array.from({ length: 23 }, (_, i) =>
      snsComment(`01KC${String(i).padStart(22, '0')}`, SNS_POST_COCO, SNS_MONG, {
        content: `댓글 ${i + 1}`,
      }),
    )
    seedSns({ viewer: SNS_ME, comments: roots })
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText('댓글 20')
    expect(rows()).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: '댓글 더보기' }))

    await within(section()).findByText('댓글 23')
    expect(rows()).toHaveLength(23)
    expect(screen.queryByRole('button', { name: '댓글 더보기' })).toBeNull()
  })

  it('비로그인도 댓글 목록을 본다', async () => {
    logout()
    seedSns({ viewer: null, comments: snsExampleComments() })
    renderAt(postPath(SNS_POST_COCO))

    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )
    expect(within(section()).queryByRole('button', { name: '수정' })).toBeNull()
  })
})

describe('댓글 길게 누르기', () => {
  it('[AC-SNS04-024][AC-SNS04-025] 남의 댓글을 길게 누르면 차단 시트를 열고 차단하면 그 작성자의 댓글이 목록에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    fireEvent.contextMenu(within(section()).getByText('코코 표정 너무 좋네요'))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))

    await waitFor(() => expect(within(section()).queryByText('코코 표정 너무 좋네요')).toBeNull())
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_MONG)).toBe(true)
    expect(requests).toContain(`POST /api/v1/sns/users/${SNS_MONG}/block`)
  })

  it('[AC-SNS04-024] 내 댓글과 안내 문구는 길게 눌러도 시트를 열지 않는다', async () => {
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '산책 코스 어디예요?',
    )

    fireEvent.contextMenu(within(section()).getByText('산책 코스 어디예요?'))
    fireEvent.contextMenu(within(section()).getByText('삭제된 댓글이에요'))

    expect(screen.queryByRole('button', { name: '차단하기' })).toBeNull()
  })
})

describe('알림으로 연 댓글', () => {
  it('[AC-SNS04-028] 대댓글이면 최상위 댓글과 함께 목록 위에 고정한다', async () => {
    renderAt(postPath(SNS_POST_COCO, `?comment=${SNS_REPLY_COCO}`))

    const pinned = await screen.findByRole('group', { name: '알림으로 연 댓글' })
    expect(within(pinned).getByText('코코 표정 너무 좋네요')).toBeInTheDocument()
    expect(within(pinned).getByText('감사해요. 다음에 같이 산책해요')).toBeInTheDocument()
    expect(within(pinned).queryByRole('button', { name: '답글달기' })).toBeNull()
  })

  it('[AC-SNS04-028] 볼 수 없는 댓글이면 상세는 그대로 열고 찾을 수 없다고 알린다', async () => {
    renderAt(postPath(SNS_POST_COCO, '?comment=01KC0000000000000000000404'))

    expect(await screen.findByText('댓글을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('article')).toBeInTheDocument()
  })

  it('[AC-SNS04-028] 비로그인은 단건을 부르지 않는다', async () => {
    logout()
    seedSns({ viewer: null, comments: snsExampleComments() })
    renderAt(postPath(SNS_POST_COCO, `?comment=${SNS_COMMENT_MONG}`))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    expect(screen.queryByRole('group', { name: '알림으로 연 댓글' })).toBeNull()
    expect(requests.filter(r => r.startsWith('GET /api/v1/sns/comments/'))).toEqual([])
  })
})

describe('댓글 리뷰 반영', () => {
  it('[AC-SNS04-024] 길게 눌러 메뉴를 연 뒤 손을 떼도 그 아래 프로필 버튼은 실행하지 않는다', async () => {
    const router = renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )
    const avatar = within(rowOf('코코 표정 너무 좋네요')).getByRole('button', {
      name: '몽이아빠 프로필',
    })

    fireEvent.pointerDown(avatar, { clientX: 10, clientY: 10 })
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.pointerUp(avatar)
    fireEvent.click(avatar)

    expect(await screen.findByRole('button', { name: '차단하기' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO))
  })

  it('[AC-SNS04-024] 화면 읽기와 키보드는 남의 댓글마다 있는 댓글 메뉴 버튼으로 차단 시트를 연다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '코코 표정 너무 좋네요',
    )

    expect(within(section()).getAllByRole('button', { name: '댓글 메뉴' })).toHaveLength(3)
    expect(
      within(rowOf('산책 코스 어디예요?')).queryByRole('button', { name: '댓글 메뉴' }),
    ).toBeNull()
    await user.click(
      within(rowOf('코코 표정 너무 좋네요')).getByRole('button', { name: '댓글 메뉴' }),
    )

    expect(await screen.findByRole('button', { name: '차단하기' })).toBeInTheDocument()
  })

  it('[AC-SNS04-025] 댓글에서 게시물 작성자를 차단하면 상세가 차단 안내로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '감사해요. 다음에 같이 산책해요',
    )

    fireEvent.contextMenu(within(section()).getByText('감사해요. 다음에 같이 산책해요'))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))

    expect(await screen.findByText('차단한 계정의 게시물이에요')).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(true)
  })

  it('받아 둔 목록을 다시 읽지 못하면 안내를 띄우고 답글, 수정, 삭제, 메뉴를 잠근다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await within(await screen.findByRole('region', { name: '댓글' })).findByText(
      '산책 코스 어디예요?',
    )
    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }))
    // 그사이 지운 댓글을 고치면 목록을 다시 읽는데 그 조회가 실패한다.
    seedSns({
      ...currentSns(),
      comments: currentSns().comments.map(r =>
        r.publicId === SNS_COMMENT_MINE ? { ...r, deleted: true, content: null } : r,
      ),
    })
    server.use(
      http.get(SNS_COMMENTS_URL, () => HttpResponse.json({ errorCode: 90000 }, { status: 500 })),
    )
    const editor = screen.getByRole('textbox', { name: '댓글 수정' })
    await user.type(editor, '!')
    await user.click(within(editor.closest('li')!).getByRole('button', { name: '저장' }))

    expect(await within(section()).findByText(/댓글을 다시 불러오지 못했어요/)).toBeInTheDocument()
    expect(within(section()).queryByRole('button', { name: '답글달기' })).toBeNull()
    expect(within(section()).queryByRole('button', { name: '수정' })).toBeNull()
    expect(within(section()).queryByRole('button', { name: '댓글 메뉴' })).toBeNull()
    expect(within(section()).getByRole('button', { name: '몽이아빠 프로필' })).toBeInTheDocument()
  })

  it('[AC-SNS04-028] 알림으로 연 댓글을 불러오지 못하면 다시 시도를 보여준다', async () => {
    let fail = true
    server.use(
      http.get(SNS_COMMENT_URL, () =>
        fail ? HttpResponse.json({ errorCode: 90000 }, { status: 500 }) : undefined,
      ),
    )
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO, `?comment=${SNS_REPLY_COCO}`))

    await user.click(await screen.findByRole('button', { name: '다시 시도' }))
    fail = false
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByRole('group', { name: '알림으로 연 댓글' })).toBeInTheDocument()
  })

  it('[AC-SNS04-028] 고정한 내 댓글과 목록의 같은 댓글 가운데 목록에만 편집창을 연다', async () => {
    const reply = '01KC0000000000000000000055'
    seedSns({
      viewer: SNS_ME,
      comments: [
        ...snsExampleComments(),
        snsComment(reply, SNS_POST_COCO, SNS_MONG, {
          parent: SNS_COMMENT_MINE,
          content: '여기 좋아요',
        }),
      ],
    })
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO, `?comment=${reply}`))
    await screen.findByRole('group', { name: '알림으로 연 댓글' })
    await within(section()).findByText('여기 좋아요', { selector: 'ul p' })

    await user.click(within(section()).getByRole('button', { name: '수정' }))

    expect(screen.getAllByRole('textbox', { name: '댓글 수정' })).toHaveLength(1)
  })
})

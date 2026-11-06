import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COMMENT_MONG,
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

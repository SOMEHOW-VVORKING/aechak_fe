import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import { SNS_HASHTAG_POSTS_URL, seedSns, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
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

let searchRequests: URL[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  searchRequests = []
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET' && /\/sns\/(search|hashtags\/[^/]+\/posts)/.test(request.url)) {
      searchRequests.push(new URL(request.url))
    }
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

const requestsTo = (path: string) => searchRequests.filter(url => url.pathname.endsWith(path))

describe('해시태그 게시물 목록', () => {
  it('[AC-SNS06-040] 헤더에 태그와 게시글 수, 정렬 칩, 피드 카드를 보이고 비회원도 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    const router = renderAt(`/sns/hashtags/${encodeURIComponent('산책')}`)

    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    expect(screen.getByText(/^게시글/)).toHaveTextContent('게시글 52')
    expect(requestsTo('/posts')[0]?.searchParams.get('sort')).toBe('POPULAR')

    await user.click(screen.getByRole('button', { name: '최신순' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ sort: 'LATEST' }))
    await waitFor(() => expect(requestsTo('/posts').at(-1)?.searchParams.get('sort')).toBe('LATEST'))
  })

  it('[AC-SNS06-041] 글이 없는 태그는 게시글 수 0과 빈 상태다', async () => {
    renderAt('/sns/hashtags/댕댕월드컵')

    expect(await screen.findByText('이 해시태그가 달린 게시물이 없어요')).toBeInTheDocument()
    expect(screen.getByText(/^게시글/)).toHaveTextContent('게시글 0')
  })

  it('[AC-SNS06-042] 피드 카드의 해시태그를 누르면 그 태그의 목록을 열고 최근 검색어에 기록하지 않는다', async () => {
    let hashtagRequests = 0
    server.use(
      http.get(SNS_HASHTAG_POSTS_URL, () => {
        hashtagRequests += 1
        return undefined
      }),
    )
    const user = userEvent.setup()
    const router = renderAt('/sns/feed?tab=explore')

    const card = (await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: '#골든리트리버' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sns/hashtags/골든리트리버'),
    )
    await waitFor(() => expect(hashtagRequests).toBe(1))
    expect(requestsTo('/search/posts')).toHaveLength(0)
  })
})

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
  SNS_SEARCH_HASHTAGS_URL,
  SNS_SEARCH_POSTS_URL,
  SNS_SEARCH_USERS_URL,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsPost,
} from '@/testing/msw/server'
import { setListEndInView } from '@/testing/intersection'
import { snsSectionLink } from '../components/SnsSearchSection'
import { defaultSnsSearchSegment, snsSearchable } from '../sns.queries'
import { routeTree } from '../../../routeTree.gen'

let queryClient: QueryClient

function renderAt(path: string, staleTime = 0) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime } } })
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

/** 산책이 든 글을 n개 더한다. 기본 픽스처의 산책 글 셋과 합쳐 n + 3개다 */
function seedWalkPosts(n: number) {
  seedSns({
    ...currentSns(),
    posts: [
      ...currentSns().posts,
      ...Array.from({ length: n }, (_, i) =>
        snsPost(`01JS${String(i + 1).padStart(22, '0')}`, SNS_COCO, { caption: `산책 일기 ${i + 1}` }),
      ),
    ],
  })
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
  setListEndInView(false)
})

const requestsTo = (path: string) => searchRequests.filter(url => url.pathname.endsWith(path))
const section = () => screen.findByRole('region', { name: 'SNS 검색 결과' })

describe('SNS 검색 규칙', () => {
  it('[AC-SNS06-001] #으로 시작하면 해시태그 세그먼트가 기본이고 #만 남는 검색어는 보내지 않는다', () => {
    expect(defaultSnsSearchSegment('#봄산책')).toBe('hashtags')
    expect(defaultSnsSearchSegment('봄산책')).toBe('posts')
    expect(snsSearchable('#')).toBe(false)
    expect(snsSearchable('  # ')).toBe(false)
    expect(snsSearchable('#봄')).toBe(true)
    // 100자를 넘으면 서버가 400을 주므로 보내지 않는다
    expect(snsSearchable('가'.repeat(100))).toBe(true)
    expect(snsSearchable('가'.repeat(101))).toBe(false)
  })

  it('[AC-SNS06-002] 게시물이 없을 때 링크는 계정 결과가 있으면 계정, 없으면 해시태그이고 계정 조회 전에는 고르지 않는다', () => {
    expect(snsSectionLink({ settled: true, count: 1 }, 1)).toBe('users')
    expect(snsSectionLink({ settled: true, count: 0 }, 1)).toBe('hashtags')
    expect(snsSectionLink({ settled: true, count: 0 }, 0)).toBeNull()
    expect(snsSectionLink({ settled: false, count: 0 }, 1)).toBeNull()
  })
})

describe('/search/results 전체 탭 SNS 섹션', () => {
  it('[AC-SNS06-010] 인기순 5개를 부르고 결과 수를 헤더와 SNS 탭에 보이며 다음 페이지가 없으면 더보기가 없다', async () => {
    renderAt('/search/results?q=산책')

    // 행의 접근명은 작성자와 본문 일부라 같은 작성자의 행도 서로 구분된다
    expect(await within(await section()).findByRole('button', { name: /^코코집사/ })).toBeInTheDocument()
    expect(within(await section()).getAllByRole('listitem')).toHaveLength(3)
    expect(within(await section()).getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'SNS 3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
    const [first] = requestsTo('/search/posts')
    expect(first?.searchParams.get('sort')).toBe('POPULAR')
    expect(first?.searchParams.get('size')).toBe('5')
    expect(within(await section()).queryByRole('button', { name: /더보기/ })).not.toBeInTheDocument()
    // 본문이 없는 글은 본문 일부 자리에 해시태그를 보인다(P15).
    expect(within(await section()).getByText('#산책')).toBeInTheDocument()
    // 마켓 섹션도 같은 화면에 있다.
    expect(screen.getByRole('region', { name: '마켓 검색 결과' })).toBeInTheDocument()
  })

  it('[AC-SNS06-011] 다음 페이지가 있으면 더보기가 보이고 #으로 시작해도 같은 검색어로 SNS 탭 게시물 세그먼트를 연다', async () => {
    seedWalkPosts(5)
    const user = userEvent.setup()
    const router = renderAt('/search/results?q=%23산책')

    await user.click(await within(await section()).findByRole('button', { name: 'SNS 결과 8개 더보기' }))

    await waitFor(() => expect(router.state.location.search).toEqual({ q: '#산책', tab: 'sns', seg: 'posts' }))
    expect(screen.getByRole('tab', { name: '게시물' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/^총/)).toHaveTextContent('총 8개')
  })

  it('[AC-SNS06-012] 게시물이 없으면 결과 수 0과 빈 문구 아래에 계정 결과 링크를 두고 누르면 계정 세그먼트를 연다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/search/results?q=코코집사')

    await user.click(await within(await section()).findByRole('button', { name: '계정 검색 결과 보기' }))
    expect(requestsTo('/search/users')[0]?.searchParams.get('size')).toBe('1')

    await waitFor(() => expect(router.state.location.search).toEqual({ q: '코코집사', tab: 'sns', seg: 'users' }))
    expect(await screen.findByRole('button', { name: '코코집사 팔로우' })).toBeInTheDocument()
  })

  it('[AC-SNS06-012] 계정 결과가 없고 해시태그만 있으면 해시태그 결과 링크다', async () => {
    renderAt('/search/results?q=스타그램')

    expect(await within(await section()).findByRole('button', { name: '해시태그 검색 결과 보기' })).toBeInTheDocument()
    expect(within(await section()).getByText('검색 결과가 없어요')).toBeInTheDocument()
    expect(within(await section()).getByText('0')).toBeInTheDocument()
  })

  it('[AC-SNS06-015] 첫 페이지가 비어도 다음 페이지가 남았으면 결과 없음 대신 더보기를 둔다', async () => {
    server.use(
      http.get(SNS_SEARCH_POSTS_URL, () =>
        HttpResponse.json({ data: { items: [], totalCount: 11, nextCursor: 'next', hasNext: true } }),
      ),
    )
    renderAt('/search/results?q=산책')

    expect(await within(await section()).findByRole('button', { name: 'SNS 결과 11개 더보기' })).toBeInTheDocument()
    expect(within(await section()).queryByText('검색 결과가 없어요')).not.toBeInTheDocument()
    expect(requestsTo('/search/users')).toHaveLength(0)
  })

  it('[AC-SNS06-016] 계정 조회가 실패하면 해시태그 결과가 있어도 링크를 고르지 않는다', async () => {
    server.use(
      http.get(SNS_SEARCH_USERS_URL, () => HttpResponse.json({ message: '' }, { status: 500 })),
      http.get(SNS_SEARCH_HASHTAGS_URL, () =>
        HttpResponse.json({ data: { items: [{ name: '코코집사', postCount: 1 }], nextCursor: null, hasNext: false } }),
      ),
    )
    renderAt('/search/results?q=코코집사')

    expect(await within(await section()).findByText('검색 결과가 없어요')).toBeInTheDocument()
    await waitFor(() => expect(requestsTo('/search/hashtags')).toHaveLength(1))
    expect(within(await section()).queryByRole('button', { name: /검색 결과 보기$/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS06-013] SNS 섹션만 실패하면 그 자리에만 다시 시도가 나오고 마켓 섹션은 그대로다', async () => {
    server.use(http.get(SNS_SEARCH_POSTS_URL, () => HttpResponse.json({ message: '' }, { status: 500 })))
    renderAt('/search/results?q=사료')

    expect(await within(await section()).findByText('SNS 검색 결과를 불러오지 못했어요')).toBeInTheDocument()
    expect(within(await section()).getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(within(await section()).queryByText('검색 결과가 없어요')).not.toBeInTheDocument()
    const market = screen.getByRole('region', { name: '마켓 검색 결과' })
    expect(await within(market).findByText(/개$/)).toBeInTheDocument()
  })

  it('[AC-SNS06-014] #만 입력하면 SNS 검색을 보내지 않고 결과 수 0과 빈 문구다', async () => {
    renderAt('/search/results?q=%23')

    expect(await within(await section()).findByText('검색 결과가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'SNS 0' })).toBeInTheDocument()
    expect(searchRequests).toHaveLength(0)
  })
})

describe('/search/results SNS 탭', () => {
  it('[AC-SNS06-020] 게시물 세그먼트가 기본이고 결과 수와 피드 카드, 인기순과 최신순 칩을 보인다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/search/results?q=산책&tab=sns')

    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '게시물' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/^총/)).toHaveTextContent('총 3개')
    expect(screen.getByRole('button', { name: '인기순' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '관련성순' })).not.toBeInTheDocument()
    // 피드 카드와 같은 카드다(리포스트, 저장, 더보기).
    const card = screen.getByRole('button', { name: '코코집사님의 게시물 보기' }).closest('article')!
    expect(within(card).getByRole('button', { name: '더보기' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '저장' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '최신순' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ q: '산책', tab: 'sns', sort: 'LATEST' }))
    await waitFor(() => expect(requestsTo('/search/posts').some(url => url.searchParams.get('sort') === 'LATEST')).toBe(true))
  })

  it('[AC-SNS06-021] #으로 시작하는 검색어는 해시태그 세그먼트로 열리고 행을 누르면 해시태그 게시물 목록으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/search/results?q=%23산책&tab=sns')

    expect(await screen.findByRole('tab', { name: '해시태그' })).toHaveAttribute('aria-selected', 'true')
    const rows = await screen.findAllByRole('button', { name: /^#/ })
    expect(rows.map(row => row.textContent)).toEqual([
      '#산책스타그램게시글 840',
      '#산책게시글 52',
      '#아침산책게시글 31',
    ])

    await user.click(rows[1]!)
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/hashtags/산책'))
    expect(await screen.findByText(/^게시글/)).toHaveTextContent('게시글 52')
  })

  it('[AC-SNS06-022] 계정 행은 펫 요약과 팔로워 수를 보이고 나를 차단한 사용자와 내 계정에는 팔로우 버튼이 없다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=코코&tab=sns&seg=users')

    expect(await screen.findByText('골든리트리버 외 1 / 팔로워 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '코코집사 팔로우' }))
    expect(await screen.findByRole('button', { name: '코코집사 팔로잉' })).toBeInTheDocument()
    expect(currentSns().follows.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(true)

    cleanup()
    renderAt('/search/results?q=차단&tab=sns&seg=users')
    expect(await screen.findByText('차단러')).toBeInTheDocument()
    expect(screen.getByText('맞차단러')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/팔로워/)).not.toBeInTheDocument()

    cleanup()
    renderAt('/search/results?q=보리언니&tab=sns&seg=users')
    expect(await screen.findByText('보리언니')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS06-023] 다음 페이지에 다시 온 계정은 한 번만 그린다', async () => {
    const row = (publicId: string, nickname: string) => ({
      publicId,
      nickname,
      profileImageUrl: null,
      petSummary: null,
      followerCount: 1,
      isMe: false,
      following: false,
      blockingMe: false,
    })
    server.use(
      http.get(SNS_SEARCH_USERS_URL, ({ request }) => {
        const second = new URL(request.url).searchParams.get('cursor') === 'next'
        return HttpResponse.json({
          data: second
            ? { items: [row('B', '산책둘'), row('C', '산책셋')], nextCursor: null, hasNext: false }
            : { items: [row('A', '산책하나'), row('B', '산책둘')], nextCursor: 'next', hasNext: true },
        })
      }),
    )
    renderAt('/search/results?q=산책&tab=sns&seg=users')

    expect(await screen.findByText('산책하나')).toBeInTheDocument()
    act(() => setListEndInView(true))
    expect(await screen.findByText('산책셋')).toBeInTheDocument()
    expect(screen.getAllByText('산책둘')).toHaveLength(1)
  })

  it('[AC-SNS06-024] 세그먼트마다 빈 상태가 나오고 연관 검색어는 제안하지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/search/results?q=없는검색어&tab=sns')

    expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument()
    expect(screen.queryByText('이런 검색어는 어때요?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '계정' }))
    expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '해시태그' }))
    expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument()
  })

  it('[AC-SNS06-025] 첫 조회 실패는 빈 상태가 아니라 네트워크 오류 안내와 다시 시도다', async () => {
    let fail = true
    server.use(
      http.get(SNS_SEARCH_POSTS_URL, () => (fail ? HttpResponse.json({ message: '' }, { status: 500 }) : undefined)),
    )
    const user = userEvent.setup()
    renderAt('/search/results?q=산책&tab=sns')

    expect(await screen.findByText('네트워크에 연결할 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('검색 결과가 없어요')).not.toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
  })

  it('[AC-SNS06-026] 다음 페이지가 실패하면 받은 글은 두고 맨 아래에 다시 시도를 둔다', async () => {
    seedWalkPosts(20)
    server.use(
      http.get(SNS_SEARCH_POSTS_URL, ({ request }) =>
        new URL(request.url).searchParams.has('cursor') ? HttpResponse.json({ message: '' }, { status: 500 }) : undefined,
      ),
    )
    renderAt('/search/results?q=산책&tab=sns')

    expect((await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })).length).toBe(20)
    act(() => setListEndInView(true))
    expect(await screen.findByText('다음 글을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /님의 게시물 보기$/ })).toHaveLength(20)
  })

  it('[AC-SNS06-027] 탭과 세그먼트를 바꿔도 검색어를 유지한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/search/results?q=산책&tab=sns&seg=users')

    await user.click(await screen.findByRole('tab', { name: '마켓' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ q: '산책', tab: 'market', seg: 'users' }))
    await user.click(screen.getByRole('tab', { name: /^SNS/ }))
    expect(await screen.findByRole('tab', { name: '계정' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('searchbox')).toHaveValue('산책')
  })
})

describe('SNS 검색 비회원과 로그인 뒤 다시 실행', () => {
  it('[AC-SNS06-030] 비회원도 결과를 보고 팔로우를 누르면 로그인 안내만 열린다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt('/search/results?q=코코&tab=sns&seg=users')

    await user.click(await screen.findByRole('button', { name: '코코집사 팔로우' }))
    expect(await screen.findByText(/팔로우는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(currentSns().follows.some(r => r.to === SNS_COCO && r.from === SNS_ME)).toBe(false)
  })

  it('[AC-SNS06-031] 로그인을 마치면 같은 검색 결과 계정 세그먼트로 돌아와 확인 없이 한 번 팔로우한다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guest = renderAt('/search/results?q=코코&tab=sns&seg=users')
    await user.click(await screen.findByRole('button', { name: '코코집사 팔로우' }))
    await user.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guest.state.location.pathname).toBe('/onboarding/login'))
    cleanup()

    let followPosts = 0
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && /\/sns\/users\/[^/]+\/follow$/.test(request.url)) followPosts += 1
    })
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME })
    const router = renderAt('/login/complete?status=ACTIVE&isNew=false')

    await waitFor(() => expect(router.state.location.search).toEqual({ q: '코코', tab: 'sns', seg: 'users' }))
    expect(await screen.findByRole('button', { name: '코코집사 팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })
})

describe('최근 검색어', () => {
  it('[AC-SNS06-050] SNS 게시물 검색 첫 페이지를 받으면 최근 검색어를 다시 읽게 하고 세그먼트 전환은 게시물 검색을 다시 보내지 않는다', async () => {
    const user = userEvent.setup()
    // 앱과 같은 staleTime이다. 0이면 세그먼트를 다시 열 때마다 첫 페이지를 다시 부른다.
    renderAt('/search?tab=sns', 60_000)
    await screen.findByText('최근 검색어')
    await waitFor(() => expect(queryClient.getQueryState(['search', 'landing'])?.status).toBe('success'))

    await user.type(screen.getByRole('searchbox'), '산책{Enter}')
    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    expect(queryClient.getQueryState(['search', 'landing'])?.isInvalidated).toBe(true)

    const posts = requestsTo('/search/posts').length
    await user.click(screen.getByRole('tab', { name: '계정' }))
    await user.click(screen.getByRole('tab', { name: '게시물' }))
    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    expect(requestsTo('/search/posts')).toHaveLength(posts)
  })
})

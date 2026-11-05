import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSnsFollowingFeed, setAccessToken, type SnsFeedItemResult } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_EXPLORE_FEED_URL,
  SNS_FOLLOWING_FEED_URL,
  SNS_ME,
  SNS_MONG,
  SNS_NEIGHBORS,
  SNS_POPULAR_FEED_URL,
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_POST_NO_CAPTION,
  SNS_SPAM,
  SNS_TORI,
  currentSns,
  seedSns,
  server,
  snsAct,
  snsPost,
  snsRelation,
} from '@/testing/msw/server'
import { setListEndInView } from '@/testing/intersection'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string, staleTime = 0) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  // retryDelay 0: 피드 조회는 5xx를 한 번 더 보내는데(retryTransient) 그 재시도를 1초 기다리지 않게 한다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime } } })
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

const neighborPostId = (i: number) => `01JQ${String(i + 1).padStart(22, '0')}`

/** 기본 픽스처보다 최근인 이웃 글 n개(이웃1의 글이 가장 최근). 기본 픽스처 8개와 합쳐 두 페이지가 된다 */
function seedNeighborPosts(n: number) {
  seedSns({
    ...currentSns(),
    posts: [
      ...currentSns().posts,
      ...SNS_NEIGHBORS.slice(0, n).map((author, i) =>
        snsPost(neighborPostId(i), author, {
          caption: `이웃 글 ${i + 1}`,
          createdAt: `2026-10-23T12:${String(59 - i).padStart(2, '0')}:00`,
        }),
      ),
    ],
  })
}

const cards = () => screen.queryAllByRole('button', { name: /님의 게시물 보기$/ })
const cardOf = (nickname: string, index = 0) =>
  screen.getAllByRole('button', { name: `${nickname}님의 게시물 보기` })[index]!.closest('article')!

let feedRequests: URL[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  feedRequests = []
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET' && /\/sns\/feeds\//.test(request.url)) feedRequests.push(new URL(request.url))
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

const requestsTo = (kind: string) => feedRequests.filter(url => url.pathname.endsWith(`/feeds/${kind}`))

describe('/sns/feed 탭', () => {
  it('[AC-SNS03-001] 비로그인은 탐색 탭으로 열리고 팔로잉 탭을 누르면 요청 없이 로그인 안내 시트가 열린다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt('/sns/feed')

    expect(await screen.findByRole('tab', { name: '탐색' })).toHaveAttribute('aria-selected', 'true')
    expect((await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '팔로잉' }))
    expect(await screen.findByText(/팔로잉 피드는 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '탐색' })).toHaveAttribute('aria-selected', 'true')
    expect(requestsTo('following')).toHaveLength(0)
  })

  it('[AC-SNS03-049] 앱 바는 제목만 보여주고 검색과 알림 버튼이 없다', async () => {
    renderAt('/sns/feed')
    expect(await screen.findByRole('heading', { name: '애착 SNS' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /검색|알림/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS03-002][AC-SNS03-004] 로그인은 팔로잉 탭으로 열리고 내 글과 팔로우한 사람의 리포스트가 리포스트 표시와 함께 나온다', async () => {
    seedSns({
      follows: [snsRelation(SNS_ME, SNS_MONG)],
      reposts: [snsAct(SNS_MONG, SNS_POST_COCO, '2026-10-23T09:00:00')],
    })
    renderAt('/sns/feed')

    expect(await screen.findByRole('tab', { name: '팔로잉' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('몽이아빠님이 리포스트했어요')).toBeInTheDocument()
    expect(within(cardOf('코코집사')).getByText('몽이아빠님이 리포스트했어요')).toBeInTheDocument()
    // 내 글(보리 생일, 산책 코스 추천받아요)과 팔로우한 몽이의 글도 나온다.
    expect(screen.getByText('보리 생일')).toBeInTheDocument()
    expect(screen.getByText('산책 코스 추천받아요')).toBeInTheDocument()
    expect(cards()).toHaveLength(4)
  })

  it('[AC-SNS03-006] 팔로잉 피드가 비면 안내와 탐색 탭 이동 버튼이 나온다', async () => {
    seedSns({ viewer: SNS_NEIGHBORS[0]! })
    const user = userEvent.setup()
    const router = renderAt('/sns/feed')

    expect(await screen.findByText('팔로잉 피드에 아직 글이 없어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '탐색 보기' }))

    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'explore' }))
    expect(screen.getByRole('tab', { name: '탐색' })).toHaveAttribute('aria-selected', 'true')
    expect((await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })).length).toBeGreaterThan(0)
  })

  it('[AC-SNS03-008][AC-SNS03-009] 탐색 피드와 인기 피드가 비면 안내 문구만 나온다', async () => {
    seedSns({ posts: [] })
    const user = userEvent.setup()
    renderAt('/sns/feed?tab=explore')

    expect(await screen.findByText('최근 7일 동안 올라온 글이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '탐색 보기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '인기' }))
    expect(await screen.findByText('지금은 인기 글이 없어요')).toBeInTheDocument()
    expect(requestsTo('popular')).toHaveLength(1)
  })
})

describe('/sns/feed 이어 불러오기', () => {
  it('[AC-SNS03-010] 첫 로딩은 스켈레톤이다', async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => (release = resolve))
    server.use(
      http.get(SNS_FOLLOWING_FEED_URL, async () => {
        await held
        return HttpResponse.json({ data: { items: [], nextCursor: null, hasNext: false } })
      }),
    )
    renderAt('/sns/feed')

    expect(await screen.findByRole('status', { name: '게시물을 불러오는 중' })).toBeInTheDocument()
    release()
    expect(await screen.findByText('팔로잉 피드에 아직 글이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '게시물을 불러오는 중' })).not.toBeInTheDocument()
  })

  it('[AC-SNS03-010] 목록 끝이 화면에 들어오면 다음 페이지를 부르고 끝까지 받으면 더 부르지 않는다', async () => {
    asGuest()
    seedNeighborPosts(25)
    renderAt('/sns/feed')

    await waitFor(() => expect(cards()).toHaveLength(20))
    expect(requestsTo('explore')).toHaveLength(1)

    setListEndInView(true)
    await waitFor(() => expect(cards()).toHaveLength(33))
    expect(requestsTo('explore')).toHaveLength(2)
    expect(requestsTo('explore')[1]!.searchParams.get('cursor')).not.toBeNull()

    setListEndInView(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(requestsTo('explore')).toHaveLength(2)
  })

  it('[AC-SNS03-014] 첫 조회가 실패하면 네트워크 오류 안내와 다시 시도가 나온다', async () => {
    asGuest()
    server.use(http.get(SNS_EXPLORE_FEED_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    const user = userEvent.setup()
    renderAt('/sns/feed')

    expect(await screen.findByText('네트워크에 연결할 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('최근 7일 동안 올라온 글이 없어요')).not.toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect((await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })).length).toBeGreaterThan(0)
  })

  it('[AC-SNS03-014] 다음 페이지가 실패하면 보여준 글을 두고 목록 끝에 실패 안내와 다시 시도가 나온다', async () => {
    asGuest()
    seedNeighborPosts(25)
    server.use(
      http.get(SNS_EXPLORE_FEED_URL, ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
          : undefined,
      ),
    )
    const user = userEvent.setup()
    renderAt('/sns/feed')
    await waitFor(() => expect(cards()).toHaveLength(20))

    setListEndInView(true)
    expect(await screen.findByText('다음 글을 불러오지 못했어요')).toBeInTheDocument()
    expect(cards()).toHaveLength(20)

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(cards()).toHaveLength(33))
    expect(screen.queryByText('다음 글을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('다음 페이지가 400 90002면 그 목록을 첫 페이지부터 다시 연다', async () => {
    asGuest()
    seedNeighborPosts(25)
    let invalidOnce = true
    server.use(
      http.get(SNS_EXPLORE_FEED_URL, ({ request }) => {
        if (!new URL(request.url).searchParams.has('cursor') || !invalidOnce) return undefined
        invalidOnce = false
        return HttpResponse.json({ errorCode: 90002, message: '' }, { status: 400 })
      }),
    )
    renderAt('/sns/feed')
    await waitFor(() => expect(cards()).toHaveLength(20))

    setListEndInView(true)
    await waitFor(() => expect(cards()).toHaveLength(33), { timeout: 3000 })
    expect(requestsTo('explore').map(url => url.searchParams.has('cursor'))).toEqual([false, true, false, true])
    expect(screen.queryByText('다음 글을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-SNS03-011] 팔로잉 피드는 페이지 사이에 다시 온 원글을 한 번만 보여준다', async () => {
    const item = (publicId: string, caption: string): SnsFeedItemResult => ({
      post: {
        publicId,
        author: { publicId: SNS_COCO, nickname: '코코집사', profileImageUrl: null },
        pet: null,
        caption,
        hashtags: [],
        photoUrls: [],
        video: null,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        edited: false,
        createdAt: '2026-10-22T09:30:00',
        isMine: false,
        following: true,
        mutedByMe: false,
        reposted: false,
        saved: false,
      },
      repostedBy: null,
    })
    server.use(
      http.get(SNS_FOLLOWING_FEED_URL, ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ data: { items: [item('B', '두 번째 글'), item('C', '세 번째 글')], nextCursor: null, hasNext: false } })
          : HttpResponse.json({ data: { items: [item('A', '첫 글'), item('B', '두 번째 글')], nextCursor: 'next', hasNext: true } }),
      ),
    )
    renderAt('/sns/feed')
    expect(await screen.findByText('첫 글')).toBeInTheDocument()

    setListEndInView(true)
    expect(await screen.findByText('세 번째 글')).toBeInTheDocument()
    expect(screen.getAllByText('두 번째 글')).toHaveLength(1)
    expect(cards()).toHaveLength(3)
  })

  it('[AC-SNS03-011] 지금 탭을 다시 누르면 첫 페이지부터 새로 읽는다', async () => {
    asGuest()
    seedNeighborPosts(25)
    const user = userEvent.setup()
    renderAt('/sns/feed')
    await waitFor(() => expect(cards()).toHaveLength(20))
    setListEndInView(true)
    await waitFor(() => expect(cards()).toHaveLength(33))
    setListEndInView(false)

    await user.click(screen.getByRole('tab', { name: '탐색' }))
    await waitFor(() => expect(cards()).toHaveLength(20))
    expect(requestsTo('explore').map(url => url.searchParams.has('cursor'))).toEqual([false, true, false])
  })

  it('다른 탭으로 바꾸면 이전 탭의 스크롤 위치가 아니라 맨 위에서 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt('/sns/feed', 60_000)
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    const list = cards()[0]!.closest('ul')!.parentElement!
    list.scrollTop = 500

    await user.click(screen.getByRole('tab', { name: '인기' }))
    expect(screen.getByRole('tab', { name: '인기' })).toHaveAttribute('aria-selected', 'true')
    expect(list.scrollTop).toBe(0)
  })

  it('상세에서 돌아오면 보던 탭의 스크롤 위치로 열고 탭을 바꾼 뒤 돌아오면 맨 위에서 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    const router = renderAt('/sns/feed', 60_000)
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    const listOf = () => cards()[0]!.closest('ul')!.parentElement!
    listOf().scrollTop = 500
    fireEvent.scroll(listOf())

    await user.click(cards()[0]!)
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\//))
    act(() => router.history.back())
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/feed'))
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(listOf().scrollTop).toBe(500)

    // 인기 탭에 다녀와 탐색 탭을 다시 열면 맨 위에서 연다(탭 전환 규칙). 그 상태로 상세에 다녀와도 맨 위다.
    await user.click(screen.getByRole('tab', { name: '인기' }))
    await user.click(screen.getByRole('tab', { name: '탐색' }))
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    await user.click(cards()[0]!)
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\//))
    act(() => router.history.back())
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'explore' }))
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(listOf().scrollTop).toBe(0)
  })
})

describe('/sns/feed 카드', () => {
  it('[AC-SNS03-017] 사진 여러 장 카드는 처음 2장과 남은 장수, 영상 카드는 그 자리 재생기, 텍스트 카드는 미디어가 없다', async () => {
    asGuest()
    seedSns({
      viewer: null,
      posts: currentSns().posts.map(p =>
        p.publicId === SNS_POST_COCO
          ? { ...p, photoUrls: ['https://cdn.aechak.com/a.jpg', 'https://cdn.aechak.com/b.jpg', 'https://cdn.aechak.com/c.jpg'] }
          : p,
      ),
    })
    renderAt('/sns/feed')

    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    const coco = within(cardOf('코코집사'))
    expect(coco.getAllByRole('img', { name: /^사진/ }).map(img => img.getAttribute('alt'))).toEqual(['사진 1/3', '사진 2/3'])
    expect(coco.getByText('+1')).toBeInTheDocument()

    const video = within(cardOf('초코맘')).getByLabelText('영상')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('poster', 'https://cdn.aechak.com/sns/posts/images/choco-thumb.jpg')

    const text = within(cardOf('보리언니', 1))
    expect(text.getByText('산책 코스 추천받아요')).toBeInTheDocument()
    expect(text.queryByRole('img', { name: /^사진/ })).not.toBeInTheDocument()
    expect(text.queryByLabelText('영상')).not.toBeInTheDocument()
  })

  it('[AC-SNS03-016][AC-SNS03-019] 펫 태그는 게시일 기준 나이이고 펫이 없으면 비우며 수정한 글에는 수정됨이 붙는다', async () => {
    asGuest()
    seedSns({
      viewer: null,
      posts: currentSns().posts.map(p => (p.publicId === SNS_POST_MINE ? { ...p, pet: { breedLabel: '푸들', birthYearMonth: null }, edited: true } : p)),
    })
    renderAt('/sns/feed')

    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    // 2021-03생 골든리트리버는 2026-10-22 게시일 기준 5살이다.
    expect(within(cardOf('코코집사')).getByText('골든리트리버 / 5살')).toBeInTheDocument()
    expect(within(cardOf('보리언니', 1)).getByText('푸들')).toBeInTheDocument()
    expect(within(cardOf('보리언니', 1)).getByText('수정됨')).toBeInTheDocument()
    expect(within(cardOf('초코맘')).queryByText(/살$/)).not.toBeInTheDocument()
  })

  it('[AC-SNS03-018] 카드를 누르면 작성자를 붙여 상세를 연다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/feed?tab=explore')

    await user.click(await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${SNS_POST_NO_CAPTION}`))
    expect(router.state.location.search).toEqual({ author: SNS_MONG })
  })

  it('[AC-SNS03-050] 카드 더보기는 내 글이면 링크 복사, 수정, 삭제이고 다른 사람 글이면 링크 복사, 뮤트, 차단이며 신고가 없다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed')

    await screen.findByText('보리 생일')
    await user.click(within(cardOf('보리언니')).getByRole('button', { name: '더보기' }))
    const mine = screen.getByRole('dialog')
    expect(within(mine).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사', '수정', '삭제'])
  })

  it('[AC-SNS03-050] 다른 사람 글 더보기에는 신고 없이 링크 복사, 뮤트, 차단이 있고 뮤트하면 그 사람의 글이 피드에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed?tab=explore')

    await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' })
    await user.click(within(cardOf('몽이아빠')).getByRole('button', { name: '더보기' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사', '이 계정 뮤트하기', '차단하기'])

    await user.click(within(sheet).getByRole('button', { name: '이 계정 뮤트하기' }))
    expect(await screen.findByText('뮤트했어요')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: '몽이아빠님의 게시물 보기' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    // 시트를 연 더보기가 다시 읽는 동안 사라져도 포커스가 body로 떨어지지 않고 앱 바 제목에 있다.
    expect(screen.getByRole('heading', { name: '애착 SNS' })).toHaveFocus()
  })

  it('카드 더보기에서 차단하면 확인을 거쳐 그 사람의 글이 빠지고 포커스는 앱 바 제목으로 간다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed?tab=explore')

    await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' })
    await user.click(within(cardOf('몽이아빠')).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '차단하기' }))
    const modal = await screen.findByRole('dialog', { name: '차단할까요?' })
    // 리포스트는 말하지 않고 내 쪽에서도 상대 게시물이 보이지 않는다는 점을 알린다.
    expect(modal).toHaveTextContent(
      '몽이아빠님과 서로의 게시물을 볼 수 없고 서로 팔로우가 해제돼요. 몽이아빠님은 회원님의 프로필도 볼 수 없어요.',
    )
    await user.click(within(modal).getByRole('button', { name: '차단' }))

    expect(await screen.findByText('차단했어요')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: '몽이아빠님의 게시물 보기' })).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: '코코집사님의 게시물 보기' })).toBeInTheDocument()
    // Modal을 연 더보기가 사라져도 포커스가 body로 떨어지지 않는다.
    expect(screen.getByRole('heading', { name: '애착 SNS' })).toHaveFocus()
  })

  it('카드에서 내 글을 지우면 확인을 거쳐 그 카드가 피드에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed')

    await screen.findByText('산책 코스 추천받아요')
    await user.click(within(cardOf('보리언니', 1)).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    const modal = await screen.findByRole('dialog', { name: '게시물을 삭제할까요?' })
    await user.click(within(modal).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText('게시물을 삭제했어요')).toBeInTheDocument()
    expect(screen.queryByText('산책 코스 추천받아요')).not.toBeInTheDocument()
    expect(currentSns().posts.find(p => p.publicId === SNS_POST_MINE)?.deleted).toBe(true)
    expect(requestsTo('following')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '애착 SNS' })).toHaveFocus()
  })
})

describe('/sns/feed 인기 피드', () => {
  it('[AC-SNS03-013] 인기 피드는 첫 페이지 순위를 따르고 커서가 만료되면 첫 페이지부터 다시 연다', async () => {
    asGuest()
    seedNeighborPosts(25)
    seedSns({
      ...currentSns(),
      reposts: SNS_NEIGHBORS.slice(0, 25).map((_, i) => snsAct(SNS_COCO, neighborPostId(i))),
    })
    let expired = true
    server.use(
      http.get(SNS_POPULAR_FEED_URL, ({ request }) => {
        if (!new URL(request.url).searchParams.has('cursor') || !expired) return undefined
        expired = false
        return HttpResponse.json({ errorCode: 90002, message: '' }, { status: 400 })
      }),
    )
    renderAt('/sns/feed?tab=popular')
    await waitFor(() => expect(cards()).toHaveLength(20))

    setListEndInView(true)
    await waitFor(() => expect(cards()).toHaveLength(25), { timeout: 3000 })
    expect(requestsTo('popular').map(url => url.searchParams.has('cursor'))).toEqual([false, true, false, true])
  })
})

// 앱과 같은 staleTime이면 피드로 돌아와도 캐시만 쓴다. 뮤트와 차단을 풀면 받아 둔 피드를 지워 첫 페이지부터 다시 읽어야
// 숨었던 글이 다시 나온다(design 6절 7번).
describe('/sns/feed 뮤트와 차단 해제 뒤', () => {
  it('[AC-SNS03-043] 뮤트를 풀고 돌아오면 그 사용자의 글이 피드에 다시 나온다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/feed?tab=explore', 60_000)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    expect(screen.queryByText('토리 생일')).not.toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_TORI } }))
    await user.click(await screen.findByRole('button', { name: '뮤트 해제' }))
    await user.click(within(await screen.findByRole('dialog', { name: '뮤트를 해제할까요?' })).getByRole('button', { name: '해제' }))
    expect(await screen.findByText('뮤트를 해제했어요')).toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/feed', search: { tab: 'explore' } }))
    expect(await screen.findByText('토리 생일')).toBeInTheDocument()
  })

  it('[AC-SNS03-044] 차단을 풀고 돌아오면 그 사용자의 글이 탐색 피드에 다시 나온다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/feed?tab=explore', 60_000)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    expect(screen.queryByText('광고 게시물')).not.toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_SPAM } }))
    await user.click(await screen.findByRole('button', { name: '차단 해제' }))
    await user.click(within(await screen.findByRole('dialog', { name: '차단을 해제할까요?' })).getByRole('button', { name: '해제' }))
    expect(await screen.findByText('차단을 해제했어요')).toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/feed', search: { tab: 'explore' } }))
    expect(await screen.findByText('광고 게시물')).toBeInTheDocument()
  })
})

describe('/sns/feed 받아 둔 카드', () => {
  it('[AC-SNS02-029] 카드의 글을 고치고 돌아오면 앱과 같은 staleTime에서도 피드를 다시 읽지 않고 그 카드에 바뀐 캡션과 수정됨이 나온다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/feed', 60_000)
    expect(await screen.findByText('산책 코스 추천받아요')).toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/posts/$publicId/edit', params: { publicId: SNS_POST_MINE } }))
    const caption = await screen.findByLabelText('캡션')
    await user.clear(caption)
    await user.type(caption, '산책 코스 정리했어요')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/feed'))
    const card = (await screen.findByText('산책 코스 정리했어요')).closest('article')!
    expect(within(card).getByText('수정됨')).toBeInTheDocument()
    expect(screen.queryByText('산책 코스 추천받아요')).not.toBeInTheDocument()
    expect(requestsTo('following')).toHaveLength(1)
  })

  it('다시 읽기가 실패하면 받아 둔 카드 위에 실패 안내를 두고 반응 버튼과 더보기의 쓰기 항목을 잠근다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed?tab=explore')
    await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' })

    server.use(http.get(SNS_EXPLORE_FEED_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByText(/게시물을 다시 불러오지 못했어요/)).toBeInTheDocument()
    const card = cardOf('몽이아빠')
    expect(within(card).getByRole('button', { name: /^리포스트/ })).toBeDisabled()
    expect(within(card).getByRole('button', { name: '저장' })).toBeDisabled()
    await user.click(within(card).getByRole('button', { name: '더보기' }))
    expect(within(screen.getByRole('dialog')).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사'])
    await user.keyboard('{Escape}')

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByText(/게시물을 다시 불러오지 못했어요/)).not.toBeInTheDocument())
    expect(within(cardOf('몽이아빠')).getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('받아 둔 카드를 모두 지워도 다음 페이지가 남았으면 빈 안내 대신 목록 끝을 두어 이어서 불러온다', async () => {
    // 첫 페이지는 내 글 하나이고 다음 페이지가 남아 있다.
    const { items } = (await getSnsFollowingFeed({ size: 20 })).data
    server.use(
      http.get(SNS_FOLLOWING_FEED_URL, ({ request }) =>
        HttpResponse.json({
          data: new URL(request.url).searchParams.has('cursor')
            ? { items: items.slice(1), nextCursor: null, hasNext: false }
            : { items: items.slice(0, 1), nextCursor: 'next', hasNext: true },
        }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/sns/feed')
    await screen.findByText('보리 생일')

    await user.click(within(cardOf('보리언니')).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    await user.click(within(await screen.findByRole('dialog', { name: '게시물을 삭제할까요?' })).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(cards()).toHaveLength(0))
    expect(screen.queryByText('팔로잉 피드에 아직 글이 없어요')).not.toBeInTheDocument()

    setListEndInView(true)
    expect(await screen.findByText('산책 코스 추천받아요')).toBeInTheDocument()
  })
})
